import { describe, expect, it } from "vitest";
import { QUICK_CHIPS } from "../apps/simulator/src/planner";
import {
  DATA_NOTICE,
  DEMO_CHIP_LABELS,
  FICTIONAL_CHIP,
  ABOUT_LICENSE,
  NEXT_MORNING_LABEL,
  SIMULATION_RIBBON,
  TRY_HINT,
  WELCOME_BODY,
  WELCOME_TITLE,
} from "../apps/simulator/src/ui-copy";

describe("simulator chrome", () => {
  it("keeps quick chips in demo script order", () => {
    expect(QUICK_CHIPS.map((chip) => chip.label)).toEqual([...DEMO_CHIP_LABELS]);
    expect(DEMO_CHIP_LABELS.join(" · ")).toBe(
      "What needs doing? · Order a new filter for the fridge · Yes, the CX-28 · Say purchase code (demo) · The hallway smoke alarm keeps chirping · Done, I swapped it · Book someone to clean the dryer vent next week · Tuesday morning · Approve with code (demo) · I just installed a new water heater, a Brimwell WH-40, in the garage · When is the water heater due? · I smell gas in the kitchen",
    );
  });

  it("states the simulation, the fictional-data label, and the next-morning control", () => {
    expect(WELCOME_TITLE).toBe("Hearthkeep simulation");
    expect(WELCOME_BODY).toContain("simulated Alexa+");
    expect(WELCOME_BODY).toContain("real local MCP server");
    expect(DATA_NOTICE).toContain("fictional sample data");
    expect(FICTIONAL_CHIP).toBe("Fictional data");
    expect(SIMULATION_RIBBON).toBe("SIMULATION — not a real Alexa+ device");
    expect(TRY_HINT).toBe("Try: What needs doing?");
    expect(NEXT_MORNING_LABEL).toBe("Next morning");
  });

  it("shows MIT in the About dialog", () => {
    expect(ABOUT_LICENSE).toBe("License: MIT");
    expect(ABOUT_LICENSE).toContain("MIT");
  });
});
