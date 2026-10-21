/**
 * QA section D. One fresh baseline per mode, cases in order.
 * The code 2468 is the fictional demo purchase code, not a credential.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MODES,
  callTool,
  initSession,
  sentences,
  simFetch,
  simState,
  start,
  stop,
  toolError,
  type Running,
  type ToolBody,
} from "./qa-harness";

const DEMO_CODE = "2468";

function text(tool: ToolBody): string {
  return tool.content[0]?.text ?? "";
}

describe.each(MODES)("QA D purchasing (%s)", (mode) => {
  let running: Running;
  let sessionId = "";
  let nextId = 2;
  const submittedCodes = [DEMO_CODE, "0000", "1111", "2222", "3333"];

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

  async function orders(): Promise<Array<{ id: string; status: string }>> {
    const state = await simState(running);
    return state.orders as Array<{ id: string; status: string }>;
  }

  it("D39 quote only", async () => {
    const tool = await callTool(running, sessionId, id(), "prepare_checkout", {
      items: [{ type: "part", optionId: "P-CX28", qty: 1, forApplianceId: "ap_fridge" }],
    });
    expect(tool.isError).toBe(false);
    expect(tool.structuredContent).toMatchObject({
      quoteId: "q_0001",
      totalUsd: "24.99",
      eta: "2026-10-23",
      capUsd: "60.00",
      overCap: false,
      expiresAt: "2026-10-21T09:15:00-07:00",
    });
    expect(await orders()).toEqual([]);
  });

  it("D40 wrong code", async () => {
    const tool = await callTool(running, sessionId, id(), "confirm_purchase", { quoteId: "q_0001", code: "0000" });
    expect(tool.isError).toBe(true);
    expect(toolError(tool)).toMatchObject({ code: "INVALID_PURCHASE_CODE", attemptsRemaining: 2 });
    expect(sentences(text(tool))).toHaveLength(1);
    expect(await orders()).toEqual([]);
  });

  it("D41 right code", async () => {
    const tool = await callTool(running, sessionId, id(), "confirm_purchase", { quoteId: "q_0001", code: DEMO_CODE });
    expect(tool.isError).toBe(false);
    expect(tool.structuredContent).toMatchObject({
      kind: "order",
      orderId: "ord_0001",
      status: "placed",
      eta: "2026-10-23",
      mock: true,
      createdTaskId: "t_0001",
    });
    const status = await callTool(running, sessionId, id(), "get_upkeep_status", {});
    const attention = status.structuredContent.attention as Array<{ applianceId: string; item: string }>;
    expect(attention.some((row) => row.applianceId === "ap_fridge" && row.item === "water_filter")).toBe(false);
    const progress = status.structuredContent.inProgress as Array<{ id: string; kind: string; item: string }>;
    expect(progress).toEqual(expect.arrayContaining([expect.objectContaining({ id: "ord_0001", kind: "order", item: "water_filter" })]));
    const tasks = status.structuredContent.tasks as Array<{ title: string; dueDate: string }>;
    expect(tasks).toEqual(expect.arrayContaining([expect.objectContaining({ title: "Install fridge water filter", dueDate: "2026-10-23" })]));
  });

  it("D42 idempotent", async () => {
    const tool = await callTool(running, sessionId, id(), "confirm_purchase", { quoteId: "q_0001", code: DEMO_CODE });
    expect(tool.isError).toBe(false);
    expect(tool.structuredContent).toMatchObject({ orderId: "ord_0001", alreadyConfirmed: true });
    expect(await orders()).toHaveLength(1);
  });

  it("D43 expiry", async () => {
    const quote = await callTool(running, sessionId, id(), "prepare_checkout", {
      items: [{ type: "part", optionId: "P-FGWF2", qty: 1, forApplianceId: "ap_fridge" }],
    });
    expect(quote.structuredContent.quoteId).toBe("q_0002");
    const clock = await simFetch(running, "/sim/clock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ set: "2026-10-21T09:16:00-07:00" }),
    });
    expect(clock.status).toBe(200);
    const tool = await callTool(running, sessionId, id(), "confirm_purchase", { quoteId: "q_0002", code: DEMO_CODE });
    expect(tool.isError).toBe(true);
    expect(toolError(tool).code).toBe("QUOTE_EXPIRED");
    expect(sentences(text(tool))).toHaveLength(1);
    expect(await orders()).toHaveLength(1);
  });

  it("D44 lockout", async () => {
    const quote = await callTool(running, sessionId, id(), "prepare_checkout", {
      items: [{ type: "part", optionId: "P-CX28", qty: 1, forApplianceId: "ap_fridge" }],
    });
    const quoteId = quote.structuredContent.quoteId;
    const first = await callTool(running, sessionId, id(), "confirm_purchase", { quoteId, code: "1111" });
    const second = await callTool(running, sessionId, id(), "confirm_purchase", { quoteId, code: "2222" });
    const third = await callTool(running, sessionId, id(), "confirm_purchase", { quoteId, code: "3333" });
    const right = await callTool(running, sessionId, id(), "confirm_purchase", { quoteId, code: DEMO_CODE });
    expect(toolError(first).attemptsRemaining).toBe(2);
    expect(toolError(second).attemptsRemaining).toBe(1);
    expect(toolError(third).code).toBe("QUOTE_LOCKED");
    expect(toolError(right).code).toBe("QUOTE_LOCKED");
    expect(await orders()).toHaveLength(1);
  });

  it("D45 over cap", async () => {
    const quote = await callTool(running, sessionId, id(), "prepare_checkout", {
      items: [{ type: "service", slotId: "S-1027A" }],
    });
    expect(quote.isError).toBe(false);
    expect(quote.structuredContent).toMatchObject({ totalUsd: "89.00", overCap: true, overByUsd: "29.00" });
    const quoteId = quote.structuredContent.quoteId as string;
    const before = await simState(running);
    const rejectedAudits = (before.audit as Array<{ action: string }>).filter((row) => row.action === "code_rejected").length;
    const blocked = await callTool(running, sessionId, id(), "confirm_purchase", { quoteId, code: DEMO_CODE });
    expect(blocked.isError).toBe(true);
    expect(toolError(blocked).code).toBe("OVER_CAP_APPROVAL_REQUIRED");
    expect(toolError(blocked).attemptsRemaining).toBeUndefined();
    const mid = await simState(running);
    const rejectedAfter = (mid.audit as Array<{ action: string }>).filter((row) => row.action === "code_rejected").length;
    expect(rejectedAfter).toBe(rejectedAudits);
    expect(mid.bookings).toEqual(before.bookings);
    const booked = await callTool(running, sessionId, id(), "confirm_purchase", {
      quoteId,
      code: DEMO_CODE,
      approveOverCap: true,
    });
    expect(booked.isError).toBe(false);
    expect(booked.structuredContent).toMatchObject({ kind: "booking", bookingId: "bk_0001", status: "booked" });
    const status = await callTool(running, sessionId, id(), "get_upkeep_status", {});
    const attention = status.structuredContent.attention as Array<{ applianceId: string; item: string }>;
    expect(attention.some((row) => row.applianceId === "ap_dryer" && row.item === "vent_cleaning")).toBe(false);
    const progress = status.structuredContent.inProgress as Array<{ id: string; kind: string }>;
    expect(progress).toEqual(expect.arrayContaining([expect.objectContaining({ id: "bk_0001", kind: "booking" })]));
  });

  it("D46 policy is server-side", async () => {
    const tool = await callTool(running, sessionId, id(), "prepare_checkout", {
      items: [{ type: "part", optionId: "P-ZX28", qty: 1, forApplianceId: "ap_fridge" }],
    });
    expect(tool.isError).toBe(true);
    expect(toolError(tool).code).toBe("POLICY_EXCLUDED");
    expect(sentences(text(tool))).toHaveLength(1);
  });

  it("D47 fit is server-side", async () => {
    const tool = await callTool(running, sessionId, id(), "prepare_checkout", {
      items: [{ type: "part", optionId: "P-FGWF2", qty: 1, forApplianceId: "ap_furnace" }],
    });
    expect(tool.isError).toBe(true);
    expect(toolError(tool).code).toBe("PART_NOT_COMPATIBLE");
    expect(sentences(text(tool))).toHaveLength(1);
  });

  it("D48 bounds", async () => {
    const calls: unknown[] = [
      { items: [{ type: "part", optionId: "P-CX28", qty: 0, forApplianceId: "ap_fridge" }] },
      { items: [{ type: "part", optionId: "P-CX28", qty: 11, forApplianceId: "ap_fridge" }] },
      { items: [] },
      {
        items: [
          { type: "part", optionId: "P-CX28", qty: 1, forApplianceId: "ap_fridge" },
          { type: "service", slotId: "S-1028P" },
        ],
      },
    ];
    for (const args of calls) {
      const tool = await callTool(running, sessionId, id(), "prepare_checkout", args);
      expect(tool.isError).toBe(true);
      expect(toolError(tool).code).toBe("INVALID_ARGUMENT");
      expect(sentences(text(tool))).toHaveLength(1);
    }
  });

  it("D49 slot taken", async () => {
    const tool = await callTool(running, sessionId, id(), "prepare_checkout", {
      items: [{ type: "service", slotId: "S-1027A" }],
    });
    expect(tool.isError).toBe(true);
    expect(toolError(tool).code).toBe("SLOT_UNAVAILABLE");
    const slots = await callTool(running, sessionId, id(), "find_service_slots", {
      applianceId: "ap_dryer",
      item: "vent_cleaning",
      from: "2026-10-26",
      to: "2026-11-01",
    });
    const ids = (slots.structuredContent.slots as Array<{ slotId: string }>).map((slot) => slot.slotId);
    expect(ids).not.toContain("S-1027A");
  });

  it("D50 lifecycle", async () => {
    const day1 = await simFetch(running, "/sim/clock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ advanceDays: 1 }),
    });
    expect(day1.status).toBe(200);
    const shipped = (await orders()).find((order) => order.id === "ord_0001");
    expect(shipped?.status).toBe("shipped");

    const day2 = await simFetch(running, "/sim/clock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ advanceDays: 1 }),
    });
    expect(day2.status).toBe(200);
    const delivered = (await orders()).find((order) => order.id === "ord_0001");
    expect(delivered?.status).toBe("delivered");
    const state = await simState(running);
    const stock = state.inventory as Array<{ name: string; qty: number; location: string }>;
    expect(stock).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Rillstone CX-28", qty: 1, location: "Received, not yet installed" })]));

    const logged = await callTool(running, sessionId, id(), "log_maintenance", {
      applianceId: "ap_fridge",
      item: "water_filter",
    });
    expect(logged.isError).toBe(false);
    expect(logged.structuredContent).toMatchObject({
      lastDone: "2026-10-23",
      nextDue: "2027-04-21",
      closedTaskIds: ["t_0001"],
    });
    expect(logged.structuredContent.inventoryAfter).toMatchObject({ qty: 0 });
  });

  it("D51 audit", async () => {
    const state = await simState(running);
    const audit = state.audit as Array<{ action: string; at: string }>;
    const actions = new Set(audit.map((row) => row.action));
    for (const action of ["quote_created", "code_rejected", "order_placed", "booking_placed", "task_created"]) {
      expect(actions.has(action)).toBe(true);
    }
    for (const row of audit) {
      expect(row.at).toMatch(/^2026-10-(21|22|23)T09:(00|16):00-07:00$/);
    }
    const dumped = JSON.stringify(state);
    for (const code of submittedCodes) {
      expect(dumped).not.toContain(code);
    }
  });
});
