import { mkdtempSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp, type AppEnv } from "@hearthkeep/mcp-server/app";

const SEED_NOW = "2026-10-21T09:00:00-07:00";
const ACCEPT = "application/json, text/event-stream";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLOCK_HINT = "Expected {advanceDays: 1-400} or {set: ISO time later than now}";

const SNAPSHOT_KEYS = ["appliances", "audit", "bookings", "clock", "inventory", "orders", "schedule", "tasks"];

async function listen(env: AppEnv): Promise<{ base: string; server: Server }> {
  const server = createServer(createApp(env));
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("expected a TCP address");
  }
  return { base: `http://127.0.0.1:${address.port}`, server };
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

function simEnv(extra: AppEnv = {}): AppEnv {
  return {
    HK_DB: ":memory:",
    HK_SIM_MODE: "1",
    HK_SIM_START: SEED_NOW,
    HK_JSON_RESPONSE: "1",
    HK_ALLOWED_ORIGINS: "http://localhost:5173,http://127.0.0.1:5173",
    ...extra,
  };
}

async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("simulation endpoints", () => {
  const open: Server[] = [];

  afterEach(async () => {
    const current = open.splice(0);
    await Promise.all(current.map((server) => close(server)));
  });

  it("reads health and state from SQLite and moves the clock only through /sim/clock", async () => {
    const started = await listen(simEnv());
    open.push(started.server);

    const health = await fetch(`${started.base}/healthz`);
    expect(health.status).toBe(200);
    expect(health.headers.get("content-type") ?? "").toContain("application/json");
    const healthBody = await bodyOf(health);
    expect(healthBody).toEqual({
      status: "ok",
      protocolVersion: "2025-11-25",
      storage: "sqlite",
      payment: "mock",
      simMode: true,
      simNow: SEED_NOW,
    });

    const state = await fetch(`${started.base}/sim/state`);
    expect(state.status).toBe(200);
    const snapshot = await bodyOf(state);
    expect(Object.keys(snapshot).sort()).toEqual(SNAPSHOT_KEYS);
    expect(snapshot.clock).toBe(SEED_NOW);
    expect(Array.isArray(snapshot.appliances)).toBe(true);
    expect((snapshot.appliances as { id: string }[]).some((item) => item.id === "ap_fridge")).toBe(true);
    expect(snapshot.orders).toEqual([]);
    expect(snapshot.bookings).toEqual([]);
    expect(snapshot.tasks).toEqual([]);

    const notLater = await fetch(`${started.base}/sim/clock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ set: "2026-10-21T16:00:00Z" }),
    });
    expect(notLater.status).toBe(400);

    const set = await fetch(`${started.base}/sim/clock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ set: "2026-10-21T17:00:00Z" }),
    });
    expect(set.status).toBe(200);
    expect(await bodyOf(set)).toEqual({ now: "2026-10-21T10:00:00-07:00" });

    const advanced = await fetch(`${started.base}/sim/clock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ advanceDays: 1 }),
    });
    expect(advanced.status).toBe(200);
    expect(await bodyOf(advanced)).toEqual({ now: "2026-10-22T10:00:00-07:00" });

    const healthAfter = await bodyOf(await fetch(`${started.base}/healthz`));
    expect(healthAfter.simNow).toBe("2026-10-22T10:00:00-07:00");
    const stateAfter = await bodyOf(await fetch(`${started.base}/sim/state`));
    expect(stateAfter.clock).toBe("2026-10-22T10:00:00-07:00");

    const session = await initialize(started.base);
    const upkeep = await callTool(started.base, session, 2, "get_upkeep_status", {});
    expect(upkeep.isError).toBe(false);
    expect(upkeep.structuredContent.now).toBe("2026-10-22T10:00:00-07:00");

    const jumped = await fetch(`${started.base}/sim/clock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ advanceDays: 400 }),
    });
    expect(jumped.status).toBe(200);
    const jumpedBody = await bodyOf(jumped);
    expect(typeof jumpedBody.now).toBe("string");
    expect((await bodyOf(await fetch(`${started.base}/healthz`))).simNow).toBe(jumpedBody.now);
    expect((await bodyOf(await fetch(`${started.base}/sim/state`))).clock).toBe(jumpedBody.now);
  });

  it("rejects clock bodies that are not advanceDays 1-400 or a later ISO time", async () => {
    const started = await listen(simEnv());
    open.push(started.server);
    const cases: { body: string; contentType?: string; message: string }[] = [
      { body: "{}", message: CLOCK_HINT },
      { body: "[]", message: CLOCK_HINT },
      { body: "null", message: CLOCK_HINT },
      { body: "{", message: CLOCK_HINT },
      { body: JSON.stringify({ advanceDays: "1" }), message: CLOCK_HINT },
      { body: JSON.stringify({ advanceDays: 1.5 }), message: CLOCK_HINT },
      { body: JSON.stringify({ advanceDays: 1, set: "2026-10-22T09:00:00-07:00" }), message: CLOCK_HINT },
      { body: JSON.stringify({ foo: 1 }), message: CLOCK_HINT },
      { body: JSON.stringify({ set: "" }), message: CLOCK_HINT },
      { body: JSON.stringify({ set: 1 }), message: CLOCK_HINT },
      {
        body: JSON.stringify({ advanceDays: 0 }),
        message: "advanceDays requires an integer from 1 to 400",
      },
      {
        body: JSON.stringify({ advanceDays: 401 }),
        message: "advanceDays requires an integer from 1 to 400",
      },
      {
        body: JSON.stringify({ set: SEED_NOW }),
        message: "set requires an ISO time later than now",
      },
      {
        body: JSON.stringify({ set: "2026-10-20T09:00:00-07:00" }),
        message: "set requires an ISO time later than now",
      },
      {
        body: JSON.stringify({ set: "tomorrow" }),
        message: "set requires an ISO time later than now",
      },
      { body: "advanceDays=1", contentType: "text/plain", message: CLOCK_HINT },
    ];

    for (const item of cases) {
      const response = await fetch(`${started.base}/sim/clock`, {
        method: "POST",
        headers: { "content-type": item.contentType ?? "application/json" },
        body: item.body,
      });
      expect(response.status, item.body).toBe(400);
      expect(await bodyOf(response)).toEqual({ error: item.message });
    }

    const untouched = await bodyOf(await fetch(`${started.base}/healthz`));
    expect(untouched.simNow).toBe(SEED_NOW);
  });

  it("resets seed v1, restores the clock, and restarts sequential ids without touching sessions", async () => {
    const started = await listen(simEnv());
    open.push(started.server);
    const before = await bodyOf(await fetch(`${started.base}/sim/state`));
    const session = await initialize(started.base);

    const registered = await callTool(started.base, session, 2, "register_appliance", {
      type: "water_heater",
      maker: "Brimwell",
      model: "WH-40",
      location: "Garage",
    });
    expect(registered.structuredContent.applianceId).toBe("ap_0001");

    const quote = await callTool(started.base, session, 3, "prepare_checkout", {
      items: [{ type: "part", optionId: "P-CX28", qty: 1, forApplianceId: "ap_fridge" }],
    });
    expect(quote.structuredContent.quoteId).toBe("q_0001");
    const order = await callTool(started.base, session, 4, "confirm_purchase", {
      quoteId: "q_0001",
      code: "2468",
    });
    expect(order.structuredContent).toMatchObject({ kind: "order", id: "ord_0001", createdTaskId: "t_0001" });

    const visit = await callTool(started.base, session, 5, "prepare_checkout", {
      items: [{ type: "service", slotId: "S-1027A" }],
    });
    expect(visit.structuredContent.quoteId).toBe("q_0002");
    const booking = await callTool(started.base, session, 6, "confirm_purchase", {
      quoteId: "q_0002",
      code: "2468",
      approveOverCap: true,
    });
    expect(booking.structuredContent).toMatchObject({ kind: "booking", id: "bk_0001" });

    const task = await callTool(started.base, session, 7, "create_task", {
      title: "Replace hallway smoke alarm battery",
      applianceId: "ap_smoke_hall",
      item: "battery",
      dueDate: "2026-10-21",
    });
    expect(task.structuredContent.taskId).toBe("t_0002");

    await fetch(`${started.base}/sim/clock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ advanceDays: 2 }),
    });
    const dirty = await bodyOf(await fetch(`${started.base}/sim/state`));
    expect(dirty.orders).toHaveLength(1);
    expect(dirty.bookings).toHaveLength(1);
    expect(dirty.tasks).toHaveLength(2);
    expect(dirty.clock).toBe("2026-10-23T09:00:00-07:00");

    const reset = await fetch(`${started.base}/sim/reset`, { method: "POST" });
    expect(reset.status).toBe(200);
    expect(await bodyOf(reset)).toEqual({ now: SEED_NOW, seed: "v1" });
    expect(await bodyOf(await fetch(`${started.base}/sim/state`))).toEqual(before);
    expect((await bodyOf(await fetch(`${started.base}/healthz`))).simNow).toBe(SEED_NOW);

    const againAppliance = await callTool(started.base, session, 8, "register_appliance", {
      type: "water_heater",
      maker: "Brimwell",
      model: "WH-40",
      location: "Garage",
    });
    expect(againAppliance.structuredContent.applianceId).toBe("ap_0001");
    const againQuote = await callTool(started.base, session, 9, "prepare_checkout", {
      items: [{ type: "part", optionId: "P-CX28", qty: 1, forApplianceId: "ap_fridge" }],
    });
    expect(againQuote.structuredContent.quoteId).toBe("q_0001");
    const againOrder = await callTool(started.base, session, 10, "confirm_purchase", {
      quoteId: "q_0001",
      code: "2468",
    });
    expect(againOrder.structuredContent).toMatchObject({ kind: "order", id: "ord_0001", createdTaskId: "t_0001" });
    const againVisit = await callTool(started.base, session, 11, "prepare_checkout", {
      items: [{ type: "service", slotId: "S-1027A" }],
    });
    expect(againVisit.structuredContent.quoteId).toBe("q_0002");
    const againBooking = await callTool(started.base, session, 12, "confirm_purchase", {
      quoteId: "q_0002",
      code: "2468",
      approveOverCap: true,
    });
    expect(againBooking.structuredContent).toMatchObject({ kind: "booking", id: "bk_0001" });
    const againTask = await callTool(started.base, session, 13, "create_task", {
      title: "Replace hallway smoke alarm battery",
      applianceId: "ap_smoke_hall",
      item: "battery",
      dueDate: "2026-10-21",
    });
    expect(againTask.structuredContent.taskId).toBe("t_0002");

    const second = await initialize(started.base);
    expect(second).toMatch(UUID_V4);
    expect(second).not.toBe(session);
  });

  it("uses HK_SIM_START for an empty database and keeps that clock in HK_DB", async () => {
    const custom = "2030-01-02T03:04:05-08:00";
    const dir = mkdtempSync(join(tmpdir(), "hk-sim-"));
    const db = join(dir, "hearthkeep.db");
    const first = await listen(simEnv({ HK_DB: db, HK_SIM_START: custom }));
    open.push(first.server);
    expect((await bodyOf(await fetch(`${first.base}/healthz`))).simNow).toBe(custom);

    const moved = await fetch(`${first.base}/sim/clock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ set: "2030-01-02T04:04:05-08:00" }),
    });
    expect(moved.status).toBe(200);
    expect(await bodyOf(moved)).toEqual({ now: "2030-01-02T04:04:05-08:00" });

    const second = await listen(simEnv({ HK_DB: db, HK_SIM_START: custom }));
    open.push(second.server);
    expect((await bodyOf(await fetch(`${second.base}/healthz`))).simNow).toBe("2030-01-02T04:04:05-08:00");
    const reset = await fetch(`${second.base}/sim/reset`, { method: "POST" });
    expect(await bodyOf(reset)).toEqual({ now: custom, seed: "v1" });
    expect((await bodyOf(await fetch(`${first.base}/healthz`))).simNow).toBe(custom);
  });

  it("returns 404 for /sim outside sim mode and for unknown sim paths", async () => {
    const disabled = await listen(simEnv({ HK_SIM_MODE: "0" }));
    open.push(disabled.server);
    for (const path of ["/sim/state", "/sim/clock", "/sim/reset", "/sim/other"]) {
      const response = await fetch(`${disabled.base}${path}`, {
        method: path === "/sim/state" || path === "/sim/other" ? "GET" : "POST",
        headers: {
          origin: "https://evil.example",
          "content-type": "application/json",
        },
        body: path === "/sim/clock" ? "{" : undefined,
      });
      expect(response.status, path).toBe(404);
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
      expect(await bodyOf(response)).toEqual({ error: "Not found" });
    }
    const health = await bodyOf(await fetch(`${disabled.base}/healthz`));
    expect(health).toMatchObject({ status: "ok", simMode: false, simNow: SEED_NOW });

    const enabled = await listen(simEnv());
    open.push(enabled.server);
    for (const [method, path] of [
      ["GET", "/sim/clock"],
      ["POST", "/sim/state"],
      ["GET", "/sim/nope"],
    ] as const) {
      const response = await fetch(`${enabled.base}${path}`, { method });
      expect(response.status, `${method} ${path}`).toBe(404);
      expect(await bodyOf(response)).toEqual({ error: "Not found" });
    }
  });

  it("applies the MCP Origin allowlist to /sim", async () => {
    const started = await listen(simEnv());
    open.push(started.server);

    const forbidden = await fetch(`${started.base}/sim/state`, {
      headers: { origin: "https://evil.example" },
    });
    expect(forbidden.status).toBe(403);
    expect(await bodyOf(forbidden)).toEqual({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32000, message: "Forbidden: Origin not allowed" },
    });

    const clockForbidden = await fetch(`${started.base}/sim/clock`, {
      method: "POST",
      headers: { origin: "https://evil.example", "content-type": "application/json" },
      body: JSON.stringify({ advanceDays: 1 }),
    });
    expect(clockForbidden.status).toBe(403);
    expect((await bodyOf(await fetch(`${started.base}/healthz`))).simNow).toBe(SEED_NOW);

    const preflight = await fetch(`${started.base}/sim/clock`, {
      method: "OPTIONS",
      headers: { origin: "http://localhost:5173" },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");

    const allowed = await fetch(`${started.base}/sim/state`, {
      headers: { origin: "http://127.0.0.1:5173" },
    });
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:5173");
    expect((await bodyOf(allowed)).clock).toBe(SEED_NOW);

    const reset = await fetch(`${started.base}/sim/reset`, {
      method: "POST",
      headers: { origin: "http://localhost:5173" },
    });
    expect(reset.status).toBe(200);
    expect(reset.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    expect(await bodyOf(reset)).toEqual({ now: SEED_NOW, seed: "v1" });
  });
});

async function initialize(base: string): Promise<string> {
  const response = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: ACCEPT },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "hearthkeep-sim-test", version: "0.0.0" },
      },
    }),
  });
  expect(response.status).toBe(200);
  const sessionId = response.headers.get("mcp-session-id") ?? "";
  expect(sessionId).toMatch(UUID_V4);
  return sessionId;
}

async function callTool(
  base: string,
  sessionId: string,
  id: number,
  name: string,
  args: unknown,
): Promise<{ isError: boolean; structuredContent: Record<string, unknown> }> {
  const response = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: ACCEPT,
      "mcp-session-id": sessionId,
      "mcp-protocol-version": "2025-11-25",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }),
  });
  expect(response.status).toBe(200);
  const payload = (await response.json()) as {
    result?: { isError: boolean; structuredContent: Record<string, unknown> };
  };
  expect(payload.result).toBeDefined();
  return payload.result as { isError: boolean; structuredContent: Record<string, unknown> };
}
