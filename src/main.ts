import { join } from "node:path";
import { DishwasherDevice } from "@matter/main/devices/dishwasher";
import { Commissioning } from "./shared/commissioning.js";
import { createServerNode, STORAGE_PATH } from "./shared/node.js";
import { Settings } from "./shared/settings.js";
import { ApplianceSettings, ProgramAppliance } from "./sim/appliance.js";
import { PHASES, PROGRAMS } from "./sim/programs.js";
import { addEndpoints, bindEndpoints } from "./matter/device.js";
import { startWebServer } from "./web/server.js";

const WEB_PORT = Number(process.env.WEB_PORT ?? 6001);
const MATTER_PORT = Number(process.env.MATTER_PORT ?? 5542);

const settings = new Settings<ApplianceSettings>(join(STORAGE_PATH, "simulator.json"), {
    programId: 0,
    optIn: true,
    speed: 1,
    energyWh: 0,
});
const appliance = new ProgramAppliance("dishwasher", PROGRAMS, PHASES, settings);

const node = await createServerNode({
    id: "dishwasher",
    name: "Simulated Dishwasher",
    productId: 0x8002,
    deviceType: DishwasherDevice.deviceType,
    port: MATTER_PORT,
    discriminator: 3842,
    passcode: 20202022,
    serialNumber: "SIM-DW-0001",
});
const endpoints = await addEndpoints(node, appliance);
bindEndpoints(appliance, endpoints);

const commissioning = new Commissioning(node);
startWebServer(WEB_PORT, {
    snapshot: () => appliance.snapshot(),
    on: (event, listener) => appliance.on(event, listener),
    action(name, args) {
        switch (name) {
            case "selectProgram": return appliance.selectProgram(Number(args.programId));
            case "setOptIn": return appliance.setOptIn(Boolean(args.optIn));
            case "setSpeed": return appliance.setSpeed(Number(args.speed));
            case "setFinishBy": return appliance.setFinishBy(args.finishByUnixS === null ? null : Number(args.finishByUnixS));
            case "start": return appliance.start();
            case "stop": return appliance.stop();
            case "pause": return appliance.pause();
            case "resume": return appliance.resume();
            case "factoryReset": return appliance.factoryReset();
            default: return `Unknown action ${name}`;
        }
    },
}, commissioning);

appliance.run();
await node.start();

const { qrPairingCode, manualPairingCode } = node.state.commissioning.pairingCodes;
console.log(`Manual pairing code: ${manualPairingCode}  QR: ${qrPairingCode}`);
