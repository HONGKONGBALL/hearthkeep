/**
 * QA section E. Each case starts from a fresh baseline, in SSE and JSON modes.
 * Names and the demo purchase code are fictional seed v1 data.
 */
import { describe, expect, it } from "vitest";
import {
  MODES,
  callTool,
  initSession,
  sessionHeaders,
  simFetch,
  simState,
  start,
  stop,
  tempDb,
  type Mode,
  type Running,
} from "./qa-harness";

const DEMO_CODE = "2468";

async function withMode(mode: Mode, extra: Parameters<typeof start>[1], run: (running: Running) => Promise<void>): Promise<void> {
  const running = await start(mode, extra);
  try {
    await run(running);
  } finally {
    await stop(running);
  }
}

async function placeFridgeFilter(running: Running, sessionId: string): Promise<void> {
  const quote = await callTool(running, sessionId, 2, "prepare_checkout", {
    items: [{ type: "part", optionId: "P-CX28", qty: 1, forApplianceId: "ap_fridge" }],
  });
  expect(quote.structuredContent.quoteId).toBe("q_0001");
  const order = await callTool(running, sessionId, 3, "confirm_purchase", { quoteId: "q_0001", code: DEMO_CODE });
  expect(order.structuredContent).toMatchObject({ orderId: "ord_0001", status: "placed" });
}

async function bookVent(running: Running, sessionId: string): Promise<void> {
  const quote = await callTool(running, sessionId, 4, "prepare_checkout", {
    items: [{ type: "service", slotId: "S-1027A" }],
  });
  const quoteId = quote.structuredContent.quoteId;
  const booked = await callTool(running, sessionId, 5, "confirm_purchase", {
    quoteId,
    code: DEMO_CODE,
    approveOverCap: true,
  });
  expect(booked.structuredContent).toMatchObject({ bookingId: "bk_0001", status: "booked" });
}

describe.each(MODES)("QA E sessions (%s)", (mode) => {
  it("E52 memory across sessions", async () => {
    await withMode(mode, {}, async (running) => {
      const first = await initSession(running);
      const registered = await callTool(running, first.sessionId, 2, "register_appliance", {
        type: "water_heater",
        maker: "Brimwell",
        model: "WH-40",
        location: "Garage",
      });
      expect(registered.structuredContent.applianceId).toBe("ap_0001");
      const removed = await fetch(`${running.base}/mcp`, {
        method: "DELETE",
        headers: sessionHeaders(first.sessionId),
      });
      expect(removed.status).toBe(200);
      const second = await initSession(running);
      expect(second.sessionId).not.toBe(first.sessionId);
      const resolved = await callTool(running, second.sessionId, 2, "resolve_appliance", { query: "water heater" });
      expect(resolved.isError).toBe(false);
      expect(resolved.structuredContent).toMatchObject({ status: "match", appliance: { id: "ap_0001" } });
    });
  });

  it("E53 survives restart", async () => {
    const dbPath = tempDb(`e53-${mode}`);
    const first = await start(mode, { HK_DB: dbPath });
    try {
      const session = await initSession(first);
      await placeFridgeFilter(first, session.sessionId);
    } finally {
      await stop(first);
    }
    const second = await start(mode, { HK_DB: dbPath });
    try {
      const session = await initSession(second);
      const status = await callTool(second, session.sessionId, 2, "get_upkeep_status", {});
      const progress = status.structuredContent.inProgress as Array<{ id: string }>;
      expect(progress.map((row) => row.id)).toContain("ord_0001");
      const state = await simState(second);
      expect(state.clock).toBe("2026-10-21T09:00:00-07:00");
    } finally {
      await stop(second);
    }
  });

  it("E54 new session sees work", async () => {
    await withMode(mode, {}, async (running) => {
      const first = await initSession(running);
      await placeFridgeFilter(running, first.sessionId);
      await bookVent(running, first.sessionId);
      const second = await initSession(running);
      const status = await callTool(running, second.sessionId, 2, "get_upkeep_status", {});
      expect(status.structuredContent.attention).toEqual([]);
      const progress = status.structuredContent.inProgress as Array<{ id: string; status: string }>;
      expect(progress.map((row) => [row.id, row.status])).toEqual([
        ["ord_0001", "placed"],
        ["bk_0001", "booked"],
      ]);
      const upcoming = status.structuredContent.upcoming as Array<{ applianceId: string; item: string; due: string }>;
      expect(upcoming.map((row) => [row.applianceId, row.item, row.due])).toEqual([
        ["ap_smoke_hall", "battery", "2026-10-28"],
        ["ap_furnace", "air_filter", "2026-10-30"],
      ]);
    });
  });

  it("E55 reset", async () => {
    await withMode(mode, {}, async (running) => {
      const session = await initSession(running);
      await callTool(running, session.sessionId, 2, "register_appliance", {
        type: "water_heater",
        maker: "Brimwell",
        model: "WH-40",
        location: "Garage",
      });
      const reset = await simFetch(running, "/sim/reset", { method: "POST" });
      expect(reset.status).toBe(200);
      expect(reset.body).toEqual({ now: "2026-10-21T09:00:00-07:00", seed: "v1" });
      const state = await simState(running);
      expect(state.orders).toEqual([]);
      expect(state.bookings).toEqual([]);
      expect(state.tasks).toEqual([]);
      expect(state.appliances).toHaveLength(6);
      const quote = await callTool(running, session.sessionId, 3, "prepare_checkout", {
        items: [{ type: "part", optionId: "P-CX28", qty: 1, forApplianceId: "ap_fridge" }],
      });
      expect(quote.structuredContent.quoteId).toBe("q_0001");
    });
  });

  it("E56 clock rules", async () => {
    await withMode(mode, {}, async (running) => {
      const advanced = await simFetch(running, "/sim/clock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ advanceDays: 1 }),
      });
      expect(advanced.status).toBe(200);
      expect(advanced.body).toEqual({ now: "2026-10-22T09:00:00-07:00" });
      const rejected = [
        { advanceDays: 0 },
        { advanceDays: -1 },
        { set: "2026-10-20T09:00:00-07:00" },
        { set: "not-a-date" },
      ];
      for (const body of rejected) {
        const response = await simFetch(running, "/sim/clock", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        expect(response.status).toBe(400);
      }
    });
    await withMode(mode, { HK_SIM_MODE: "0" }, async (running) => {
      const clock = await simFetch(running, "/sim/clock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ advanceDays: 1 }),
      });
      const state = await simFetch(running, "/sim/state");
      const health = await simFetch(running, "/healthz");
      expect(clock.status).toBe(404);
      expect(state.status).toBe(404);
      expect(health.status).toBe(200);
      expect(health.body).toMatchObject({ simMode: false });
    });
  });

  it("E57 sim routes check origin", async () => {
    await withMode(mode, {}, async (running) => {
      const moved = await simFetch(running, "/sim/clock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ advanceDays: 1 }),
      });
      expect(moved.status).toBe(200);
      const before = await simState(running);
      const reset = await simFetch(running, "/sim/reset", {
        method: "POST",
        headers: { origin: "http://evil.example" },
      });
      expect(reset.status).toBe(403);
      const after = await simState(running);
      expect(after).toEqual(before);
    });
  });
});
