import { DishwasherMode } from "@matter/main/clusters/dishwasher-mode";
import type { Program } from "./appliance.js";

const { ModeTag } = DishwasherMode;

export const PHASES = ["pre-soak", "main-wash", "rinse", "final-rinse", "drying"];
const [PRE_SOAK, MAIN_WASH, RINSE, FINAL_RINSE, DRYING] = PHASES.keys();

/** Programs match the ESP32 Acme dishwasher so forecasts look the same as the real device. */
export const PROGRAMS: Program[] = [
    {
        id: 0,
        name: "Eco 50°",
        modeTags: [ModeTag.Normal, ModeTag.LowEnergy],
        steps: [
            { minutes: 15, watts: 100, phase: PRE_SOAK },
            { minutes: 12, watts: 2000, phase: MAIN_WASH },
            { minutes: 60, watts: 150, phase: MAIN_WASH },
            { minutes: 30, watts: 100, phase: RINSE },
            { minutes: 8, watts: 2000, phase: FINAL_RINSE },
            { minutes: 85, watts: 10, phase: DRYING },
        ],
    },
    {
        id: 1,
        name: "Intensive 70°",
        modeTags: [ModeTag.Max, ModeTag.Heavy],
        steps: [
            { minutes: 10, watts: 100, phase: PRE_SOAK },
            { minutes: 18, watts: 2000, phase: MAIN_WASH },
            { minutes: 40, watts: 200, phase: MAIN_WASH },
            { minutes: 15, watts: 100, phase: RINSE },
            { minutes: 20, watts: 2000, phase: FINAL_RINSE },
            { minutes: 10, watts: 500, phase: FINAL_RINSE },
            { minutes: 22, watts: 400, phase: DRYING },
        ],
    },
    {
        id: 2,
        name: "Quick 45°",
        modeTags: [ModeTag.Quick, ModeTag.Light],
        steps: [
            { minutes: 9, watts: 2000, phase: MAIN_WASH },
            { minutes: 12, watts: 150, phase: MAIN_WASH },
            { minutes: 6, watts: 2000, phase: FINAL_RINSE },
            { minutes: 3, watts: 50, phase: DRYING },
        ],
    },
    {
        id: 3,
        name: "Heavy 65°",
        modeTags: [ModeTag.Heavy],
        steps: [
            { minutes: 8, watts: 2000, phase: PRE_SOAK },
            { minutes: 15, watts: 2000, phase: MAIN_WASH },
            { minutes: 35, watts: 200, phase: MAIN_WASH },
            { minutes: 15, watts: 100, phase: RINSE },
            { minutes: 12, watts: 2000, phase: FINAL_RINSE },
            { minutes: 35, watts: 50, phase: DRYING },
        ],
    },
];
