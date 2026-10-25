# matterjs-dishwasher

A [matter.js](https://github.com/project-chip/matter.js) dishwasher simulator for developing energy managers. It exposes a dishwasher with a **Device Energy Management** forecast for each program and accepts **start-time adjustment** requests. It runs as one Node process: the Matter device, the web UI and the simulation together.

It is one of four simulators that also include [matterjs-washing-machine](https://github.com/tomasmcguinness/matterjs-washing-machine), [matterjs-heat-pump](https://github.com/tomasmcguinness/matterjs-heat-pump) and [matterjs-solar-inverter](https://github.com/tomasmcguinness/matterjs-solar-inverter). They are built to work with [matter-js-energy-manager](https://github.com/tomasmcguinness/matter-js-energy-manager).

## Running

Requires Node.js 20.19+ or 22.13+ (required by matter.js).

```bash
npm install
npm run dev
```

Open the UI at `http://localhost:6001`. Every asset (Bootstrap, socket.io and the QR code renderer) is served from `node_modules`, so the UI works with no internet connection.

| Setting | Default | Environment variable |
|---|---|---|
| Web UI port | 6001 | `WEB_PORT` |
| Matter port | 5542 | `MATTER_PORT` |
| Storage | `./.matter-storage` | `MATTER_STORAGE_PATH` |
| Log level | `info` | `MATTER_LOG_LEVEL` |

`npm run build` compiles to `dist/`, and `npm start` runs the compiled build.

## Commissioning

| | |
|---|---|
| Manual pairing code | `3497-021-2338` |
| QR payload | `MT:06PS0Q12120O0648G00` |
| Passcode / discriminator | `20202022` / `3842` |
| Vendor / product ID | `0xFFF1` (test vendor) / `0x8002` |

The **Settings** tab shows the QR code and the fabrics the device belongs to. It has two actions:

- **Open commissioning window** opens a window so another controller can join.
- **Factory reset** erases all fabrics, Matter storage and simulator settings, then restarts the node uncommissioned.

## Conventions

- **Power sign:** Electrical Power Measurement `activePower` is positive when the device consumes power and negative when it produces it. Units are mW, mV and mA.
- **Time:** matter.js takes epoch-s values (forecast start/end and `requestedStartTime`) as **Unix seconds** and converts them to the Matter epoch on the wire. Controllers built on matter.js should send Unix seconds too.
- **Forecast size:** forecasts have at most 10 slots, the limit in the Matter specification.

## Endpoints

| Endpoint | Device types | Clusters |
|---|---|---|
| 0 | Root Node | standard root clusters |
| 1 | Dishwasher (0x0075) | Identify, Operational State (Start, Stop, Pause, Resume, `countdownTime`, phases), Dishwasher Mode (one mode per program) |
| 2 | Device Energy Management (0x050D) + Electrical Sensor (0x0510) | Device Energy Management (PFR, STA), Device Energy Management Mode, Electrical Power Measurement, Electrical Energy Measurement, Power Topology |

The layout matches the ESP32 Acme dishwasher.

## Programs

The program table matches the ESP32 Acme dishwasher. Each step becomes one forecast slot.

| Program | Steps (minutes × W, phase) | Duration | Energy |
|---|---|---|---|
| Eco 50° | 15×100 pre-soak, 12×2000 main-wash, 60×150 main-wash, 30×100 rinse, 8×2000 final-rinse, 85×10 drying | 3 h 30 | 0.91 kWh |
| Intensive 70° | 10×100 pre-soak, 18×2000 main-wash, 40×200 main-wash, 15×100 rinse, 20×2000 final-rinse, 10×500 final-rinse, 22×400 drying | 2 h 15 | 1.67 kWh |
| Quick 45° | 9×2000 main-wash, 12×150 main-wash, 6×2000 final-rinse, 3×50 drying | 30 min | 0.53 kWh |
| Heavy 65° | 8×2000 pre-soak, 15×2000 main-wash, 35×200 main-wash, 15×100 rinse, 12×2000 final-rinse, 35×50 drying | 2 h | 1.34 kWh |

Operational State phases: `pre-soak`, `main-wash`, `rinse`, `final-rinse`, `drying`. A program can only be changed while the dishwasher is idle. ChangeToMode returns `InvalidInMode` otherwise.

## Device Energy Management

The DEM cluster on endpoint 2 has the **PowerForecastReporting** and **StartTimeAdjustment** features. **Pausable** isn't offered, so forecast slots can never be paused. Each forecast slot is one program step, with fixed duration and power (min = default = max).

1. **Start.** Press *Start* in the UI, or send OperationalState `Start`.
   - **Opted in:** the program waits 60 s before it runs. It publishes a forecast with `earliestStartTime` = now and `latestEndTime` = *Finish by*, which defaults to now + 12 h. OperationalState stays *Stopped* while `countdownTime` counts down to the end of the program.
   - **Opted out:** the program starts at once. The forecast window then equals the forecast itself, so it can't move.
2. **`StartTimeAdjustRequest`.** A request is accepted when it starts within `[earliestStartTime, latestEndTime − duration]` and before the program begins. An accepted request moves the start and publishes a new `forecastId` with reason `LocalOptimization` or `GridOptimization`. Anything else returns `CONSTRAINT_ERROR`.
3. **`CancelRequest`.** Restores the device's own start time.
4. **Running.** `activeSlotNumber` and the slot elapsed/remaining times update at each slot boundary. When the program completes, the device emits the `OperationCompletion` event and sets the forecast to null.

**Opt-in** combines the UI switch with the DEM Mode cluster:

- *No energy management* and *Device optimisation* give `OptOut`.
- *Local* or *Grid* opt out of the other source.
- *Local and grid optimisation* is the default.

The **simulation speed** on the Settings tab (1× to 300×) speeds up running programs. Forecast durations are scaled to match.

## UI

- **Main tab:**
  - an outline drawing whose spray arms turn and spray while washing, and which shows steam while drying;
  - program and *Finish by* selection, the opt-in switch, and Start, Pause, Resume and Stop buttons;
  - live status;
  - the published forecast, with the active slot hatched.
- **Settings tab:** commissioning, simulation speed and factory reset.

## Project layout

```
src/
  main.ts                 boots the simulator, Matter node and web server
  sim/appliance.ts        program-driven appliance model: start window, adjustments, run and complete
  sim/programs.ts         program definitions
  matter/device.ts        endpoints and the bridge from the model to Matter state
  matter/program-*.ts     OperationalState, Mode and DEM behaviour shared with the other appliance simulator
  shared/                 forecast builder, energy clusters, commissioning, node setup, settings (shared with the sibling simulators)
  web/server.ts           Express and socket.io UI server
public/                   index.html (drawing and controls), app.js, common.js (Settings tab, charts), style.css
```
