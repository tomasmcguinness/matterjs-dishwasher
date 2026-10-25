import { Endpoint, ServerNode } from "@matter/main";
import { DescriptorServer } from "@matter/main/behaviors/descriptor";
import { ModeBase } from "@matter/main/clusters/mode-base";
import { DishwasherDevice, DishwasherRequirements } from "@matter/main/devices/dishwasher";
import { DeviceEnergyManagementEndpoint } from "@matter/main/endpoints/device-energy-management";
import { DeviceEnergyManagement } from "@matter/main/clusters/device-energy-management";
import { DEFAULT_DEM_MODE, DEM_MODES, demModePermissions, demModeServer, energyMeasurementState, EnergyMeasurementServer, NodePowerTopologyServer, PowerMeasurementServer, powerMeasurementState, updateMeasurements } from "../shared/energy.js";
import { ElectricalSensorEndpoint } from "@matter/main/endpoints/electrical-sensor";
import type { ProgramAppliance } from "../sim/appliance.js";
import { changeToMode, commandResponse, operationalStateInitial, operationalStateValues, supportedModes } from "./program-clusters.js";
import { programDemInitial, programDemServer } from "./program-dem.js";

/**
 * Endpoint 1 is the dishwasher; endpoint 2 is Device Energy Management plus Electrical Sensor, matching the ESP32
 * Acme dishwasher layout.
 */
export async function addEndpoints(node: ServerNode, appliance: ProgramAppliance) {
    class OperationalStateServer extends DishwasherRequirements.OperationalStateServer {
        override start() {
            return this.#apply(appliance.start());
        }
        override stop() {
            return this.#apply(appliance.stop());
        }
        override pause() {
            return this.#apply(appliance.pause());
        }
        override resume() {
            return this.#apply(appliance.resume());
        }
        #apply(error: string | undefined) {
            if (!error) Object.assign(this.state, operationalStateValues(appliance));
            return commandResponse(error);
        }
    }

    class ModeServer extends DishwasherRequirements.DishwasherModeServer {
        override changeToMode({ newMode }: ModeBase.ChangeToModeRequest) {
            const result = changeToMode(appliance, newMode);
            if (result.status === ModeBase.ModeChangeStatus.Success) this.state.currentMode = newMode;
            return result;
        }
    }

    const dishwasher = new Endpoint(
        DishwasherDevice.with(OperationalStateServer, ModeServer, DishwasherRequirements.IdentifyServer),
        {
            id: "dishwasher",
            number: 1,
            operationalState: operationalStateInitial(appliance),
            dishwasherMode: { supportedModes: supportedModes(appliance), currentMode: appliance.program.id },
        },
    );
    await node.add(dishwasher);

    const energy = new Endpoint(
        DeviceEnergyManagementEndpoint.with(
            DescriptorServer,
            programDemServer(appliance),
            demModeServer(mode => {
                const { local, grid } = demModePermissions(mode);
                appliance.setDemPermissions(local, grid);
            }),
            PowerMeasurementServer,
            EnergyMeasurementServer,
            NodePowerTopologyServer,
        ),
        {
            id: "energy",
            number: 2,
            descriptor: {
                deviceTypeList: [
                    { deviceType: DeviceEnergyManagementEndpoint.deviceType, revision: DeviceEnergyManagementEndpoint.deviceRevision },
                    { deviceType: ElectricalSensorEndpoint.deviceType, revision: ElectricalSensorEndpoint.deviceRevision },
                ],
            },
            deviceEnergyManagement: programDemInitial(appliance, DeviceEnergyManagement.EsaType.Dishwasher, 2200),
            deviceEnergyManagementMode: { supportedModes: DEM_MODES, currentMode: DEFAULT_DEM_MODE },
            electricalPowerMeasurement: powerMeasurementState(0, 2200),
            electricalEnergyMeasurement: energyMeasurementState(),
            powerTopology: {},
        },
    );
    await node.add(energy);

    return { dishwasher, energy };
}

/** Mirrors simulator changes onto the Matter endpoints. Updates are serialised and coalesced. */
export function bindEndpoints(appliance: ProgramAppliance, endpoints: { dishwasher: Endpoint; energy: Endpoint }) {
    const { dishwasher, energy } = endpoints;
    let pending = false;
    let running: Promise<void> = Promise.resolve();
    let lastPowerW = -1;
    let lastEnergyPush = 0;

    const push = async () => {
        pending = false;
        await dishwasher.set({
            operationalState: operationalStateValues(appliance),
            dishwasherMode: { currentMode: appliance.program.id },
        } as never);
        await energy.set({
            deviceEnergyManagement: { forecast: appliance.forecast, optOutState: appliance.optOutState },
        } as never);
        // Power is pushed when it changes; cumulative energy at most every 10 s to keep event traffic down.
        const now = Date.now();
        if (appliance.powerW !== lastPowerW || now - lastEnergyPush > 10_000) {
            lastPowerW = appliance.powerW;
            lastEnergyPush = now;
            await updateMeasurements(energy, appliance.powerW, appliance.settings.value.energyWh);
        }
    };

    appliance.on("change", () => {
        if (pending) return;
        pending = true;
        running = running.then(push).catch(error => {
            // Updates racing a factory reset are dropped; the reset publishes fresh state once the node is back.
            if (!dishwasher.lifecycle.isReady || !energy.lifecycle.isReady) return;
            console.error("Failed to update Matter state", error);
        });
    });

    appliance.on("completed", ({ totalOperationalTime }: { totalOperationalTime: number }) => {
        Promise.resolve(dishwasher.act(agent => {
                agent.get(DishwasherRequirements.OperationalStateServer).events.operationCompletion.emit(
                    { completionErrorCode: 0, totalOperationalTime, pausedTime: 0 },
                    agent.context,
                );
            }))
            .catch((error: unknown) => console.error("Failed to emit OperationCompletion", error));
    });
}
