/**
 * QA section C. One fresh baseline per mode, cases in order.
 * Appliance names, prices, and dates are fictional seed v1 data.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MODES,
  callTool,
  contains,
  initSession,
  sentences,
  simState,
  start,
  stop,
  toolError,
  type Running,
  type ToolBody,
} from "./qa-harness";

function text(tool: ToolBody): string {
  return tool.content[0]?.text ?? "";
}

describe.each(MODES)("QA C home memory (%s)", (mode) => {
  let running: Running;
  let sessionId = "";
  let nextId = 2;

  beforeAll(async () => {
    running = await start(mode);
    sessionId = (await initSession(running)).sessionId;
  });

  afterAll(async () => {
    await stop(running);
  });

  function id(): number {
    const current = nextId;
    nextId += 1;
    return current;
  }

  it("C24 status buckets", async () => {
    const tool = await callTool(running, sessionId, id(), "get_upkeep_status", {});
    expect(tool.isError).toBe(false);
    expect(sentences(text(tool)).length).toBeGreaterThan(0);
    const structured = tool.structuredContent;
    const attention = structured.attention as Array<{ applianceId: string; item: string; bucket: string; due: string; daysOverdue?: number }>;
    expect(attention.map((row) => [row.applianceId, row.item, row.bucket, row.due, row.daysOverdue ?? null])).toEqual([
      ["ap_dryer", "vent_cleaning", "overdue", "2026-09-30", 21],
      ["ap_fridge", "water_filter", "due_today", "2026-10-21", null],
    ]);
    const upcoming = structured.upcoming as Array<{ applianceId: string; item: string; due: string; daysUntil: number }>;
    expect(upcoming.map((row) => [row.applianceId, row.item, row.due, row.daysUntil])).toEqual([
      ["ap_smoke_hall", "battery", "2026-10-28", 7],
      ["ap_furnace", "air_filter", "2026-10-30", 9],
    ]);
    expect(structured.inProgress).toEqual([]);
    expect(structured.tasks).toEqual([]);
    expect(contains(text(tool), "dryer vent")).toBe(true);
    expect(contains(text(tool), "fridge water filter")).toBe(true);
  });

  it("C25 resolve match", async () => {
    const tool = await callTool(running, sessionId, id(), "resolve_appliance", { query: "the fridge" });
    expect(tool.isError).toBe(false);
    expect(tool.structuredContent.status).toBe("match");
    expect(tool.structuredContent.appliance).toMatchObject({ id: "ap_fridge", model: "FG-28" });
  });

  it("C26 resolve ambiguous", async () => {
    const tool = await callTool(running, sessionId, id(), "resolve_appliance", { query: "smoke alarm" });
    expect(tool.isError).toBe(false);
    expect(tool.structuredContent.status).toBe("ambiguous");
    const candidates = tool.structuredContent.candidates as Array<{ id: string }>;
    expect(candidates.map((row) => row.id)).toEqual(["ap_smoke_hall", "ap_smoke_bed"]);
    expect(contains(text(tool), "which")).toBe(true);
  });

  it("C27 resolve none", async () => {
    const tool = await callTool(running, sessionId, id(), "resolve_appliance", { query: "garage door" });
    expect(tool.isError).toBe(true);
    expect(toolError(tool).code).toBe("APPLIANCE_NOT_FOUND");
    expect(sentences(text(tool))).toHaveLength(1);
    expect(contains(text(tool), "add")).toBe(true);
  });

  it("C28 fridge parts", async () => {
    const tool = await callTool(running, sessionId, id(), "find_parts", { applianceId: "ap_fridge", item: "water_filter" });
    expect(tool.isError).toBe(false);
    const options = tool.structuredContent.options as Array<{
      optionId: string;
      priceUsd: string;
      kind: string;
      certified: boolean;
      eta: string;
      recommended: boolean;
    }>;
    expect(options.map((row) => [row.optionId, row.priceUsd, row.kind, row.certified, row.eta, row.recommended])).toEqual([
      ["P-CX28", "24.99", "compatible", true, "2026-10-23", true],
      ["P-FGWF2", "49.99", "oem", true, "2026-10-23", false],
    ]);
    expect(tool.structuredContent.excluded).toEqual([
      expect.objectContaining({ optionId: "P-ZX28", reason: "POLICY_UNCERTIFIED" }),
    ]);
    expect(tool.structuredContent.onHand).toMatchObject({ qty: 0 });
    expect(tool.structuredContent.recommendedAction).toBe("buy");
  });

  it("C29 furnace parts", async () => {
    const tool = await callTool(running, sessionId, id(), "find_parts", { applianceId: "ap_furnace", item: "air_filter" });
    expect(tool.isError).toBe(false);
    const options = tool.structuredContent.options as Array<{ optionId: string; priceUsd: string; eta: string; recommended: boolean }>;
    expect(options.map((row) => [row.optionId, row.priceUsd, row.eta, row.recommended])).toEqual([
      ["P-LF11", "27.99", "2026-10-23", true],
      ["P-CF11", "38.97", "2026-10-24", false],
    ]);
    expect(tool.structuredContent.excluded).toEqual([
      expect.objectContaining({ optionId: "P-LF13", reason: "EXCEEDS_MAKER_SPEC" }),
    ]);
  });

  it("C30 stock first", async () => {
    const tool = await callTool(running, sessionId, id(), "find_parts", { applianceId: "ap_smoke_hall", item: "battery" });
    expect(tool.isError).toBe(false);
    const options = tool.structuredContent.options as Array<{ optionId: string; priceUsd: string; eta: string; recommended: boolean }>;
    expect(options.map((row) => [row.optionId, row.priceUsd, row.eta, row.recommended])).toEqual([
      ["P-VW9V", "11.49", "2026-10-22", false],
    ]);
    expect(tool.structuredContent.onHand).toMatchObject({ qty: 2, location: "Garage shelf" });
    expect(tool.structuredContent.recommendedAction).toBe("use_on_hand");
  });

  it("C31 wrong item", async () => {
    const tool = await callTool(running, sessionId, id(), "find_parts", { applianceId: "ap_dryer", item: "water_filter" });
    expect(tool.isError).toBe(true);
    expect(toolError(tool).code).toBe("ITEM_NOT_APPLICABLE");
    expect(sentences(text(tool))).toHaveLength(1);
  });

  it("C32 diagnose", async () => {
    const tool = await callTool(running, sessionId, id(), "diagnose_symptom", {
      applianceId: "ap_smoke_hall",
      symptom: "keeps chirping",
    });
    expect(tool.isError).toBe(false);
    expect(tool.structuredContent).toMatchObject({ hazard: false, cause: "low_battery", item: "battery" });
  });

  it("C33 hazard", async () => {
    const before = await simState(running);
    const tool = await callTool(running, sessionId, id(), "diagnose_symptom", {
      applianceId: "ap_smoke_hall",
      symptom: "it's going off and I smell smoke",
    });
    expect(tool.isError).toBe(false);
    expect(tool.structuredContent.hazard).toBe(true);
    expect(contains(text(tool), "leave")).toBe(true);
    expect(contains(text(tool), "emergency")).toBe(true);
    const after = await simState(running);
    expect(after).toEqual(before);
  });

  it("C34 task then log", async () => {
    const task = await callTool(running, sessionId, id(), "create_task", {
      title: "Replace hallway smoke alarm battery",
      applianceId: "ap_smoke_hall",
      item: "battery",
      dueDate: "2026-10-21",
      notes: "Use a 9V from the Garage shelf",
    });
    expect(task.isError).toBe(false);
    expect(task.structuredContent.taskId).toBe("t_0001");

    const logged = await callTool(running, sessionId, id(), "log_maintenance", {
      applianceId: "ap_smoke_hall",
      item: "battery",
    });
    expect(logged.isError).toBe(false);
    expect(logged.structuredContent).toMatchObject({
      lastDone: "2026-10-21",
      nextDue: "2027-10-21",
      closedTaskIds: ["t_0001"],
    });
    expect(logged.structuredContent.inventoryAfter).toMatchObject({ qty: 1, location: "Garage shelf" });

    const status = await callTool(running, sessionId, id(), "get_upkeep_status", {});
    const rows = [
      ...(status.structuredContent.attention as Array<{ applianceId: string; item: string }>),
      ...(status.structuredContent.upcoming as Array<{ applianceId: string; item: string }>),
      ...(status.structuredContent.inProgress as Array<{ applianceId: string; item: string }>),
    ];
    expect(rows.some((row) => row.applianceId === "ap_smoke_hall" && row.item === "battery")).toBe(false);
    expect(status.structuredContent.tasks).toEqual([]);
  });

  it("C35 register known model", async () => {
    const args = { type: "water_heater", maker: "Brimwell", model: "WH-40", location: "Garage" };
    const first = await callTool(running, sessionId, id(), "register_appliance", args);
    expect(first.isError).toBe(false);
    expect(first.structuredContent).toMatchObject({
      created: true,
      applianceId: "ap_0001",
      scheduleSource: "catalog",
    });
    const schedule = first.structuredContent.schedule as Array<{ item: string; everyDays: number; nextDue: string }>;
    expect(schedule).toEqual([expect.objectContaining({ item: "flush", everyDays: 365, nextDue: "2027-10-21" })]);

    const repeat = await callTool(running, sessionId, id(), "register_appliance", args);
    expect(repeat.structuredContent).toMatchObject({ created: false, applianceId: "ap_0001" });

    const status = await callTool(running, sessionId, id(), "get_upkeep_status", {
      horizonDays: 400,
      applianceId: "ap_0001",
    });
    const upcoming = status.structuredContent.upcoming as Array<{ item: string; due: string }>;
    expect(upcoming.map((row) => [row.item, row.due])).toEqual([["flush", "2027-10-21"]]);
  });

  it("C36 register unknown model", async () => {
    const tool = await callTool(running, sessionId, id(), "register_appliance", {
      type: "dishwasher",
      maker: "Zephyrine",
      model: "Q-1",
      location: "Kitchen",
    });
    expect(tool.isError).toBe(false);
    expect(tool.structuredContent).toMatchObject({ created: true, scheduleSource: "none", schedule: [] });
    expect(contains(text(tool), "no schedule")).toBe(true);
    expect(contains(text(tool), "model")).toBe(true);
  });

  it("C37 service slots", async () => {
    const tool = await callTool(running, sessionId, id(), "find_service_slots", {
      applianceId: "ap_dryer",
      item: "vent_cleaning",
      from: "2026-10-26",
      to: "2026-11-01",
    });
    expect(tool.isError).toBe(false);
    const slots = tool.structuredContent.slots as Array<{
      slotId: string;
      provider: string;
      start: string;
      end: string;
      priceUsd: string;
      overCap: boolean;
    }>;
    expect(slots.map((slot) => [slot.slotId, slot.provider, slot.start, slot.end, slot.priceUsd, slot.overCap])).toEqual([
      ["S-1027A", "Ventora Home Care", "2026-10-27T09:00:00-07:00", "2026-10-27T11:00:00-07:00", "89.00", true],
      ["S-1028P", "Flueline Services", "2026-10-28T13:00:00-07:00", "2026-10-28T15:00:00-07:00", "109.00", true],
      ["S-1031A", "Ventora Home Care", "2026-10-31T10:00:00-07:00", "2026-10-31T12:00:00-07:00", "99.00", true],
    ]);
  });

  it("C38 past window", async () => {
    const tool = await callTool(running, sessionId, id(), "find_service_slots", {
      applianceId: "ap_dryer",
      item: "vent_cleaning",
      from: "2026-10-01",
      to: "2026-10-07",
    });
    expect(tool.isError).toBe(true);
    expect(toolError(tool).code).toBe("INVALID_ARGUMENT");
    expect(sentences(text(tool))).toHaveLength(1);
  });
});
