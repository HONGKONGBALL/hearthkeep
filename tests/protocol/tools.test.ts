import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "@hearthkeep/mcp-server/app";

const ACCEPT = "application/json, text/event-stream";
const TOOL_NAMES = [
  "get_upkeep_status",
  "resolve_appliance",
  "find_parts",
  "diagnose_symptom",
  "find_service_slots",
];

interface ToolContent {
  type: string;
  text: string;
}

interface ToolPayload {
  content: ToolContent[];
  structuredContent: { [key: string]: unknown };
  isError?: boolean;
}

async function listen(): Promise<{ base: string; server: Server }> {
  const server = createServer(createApp({ HK_JSON_RESPONSE: "1", HK_DB: ":memory:" }));
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

function sentences(text: string): string[] {
  const found: string[] = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const mark = text[index];
    if (mark !== "." && mark !== "!" && mark !== "?") continue;
    const previous = text[index - 1] ?? "";
    const next = text[index + 1] ?? "";
    if (mark === "." && /\d/.test(previous) && /\d/.test(next)) continue;
    const sentence = text.slice(start, index + 1).trim();
    if (sentence !== "") found.push(sentence);
    start = index + 1;
  }
  const tail = text.slice(start).trim();
  if (tail !== "") found.push(tail);
  return found;
}

describe("read-only P0 tools over HTTP", () => {
  const open: Server[] = [];
  let base = "";

  afterEach(async () => {
    const current = open.splice(0);
    await Promise.all(current.map((server) => close(server)));
  });

  async function session(): Promise<string> {
    const started = await listen();
    open.push(started.server);
    base = started.base;
    const init = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: ACCEPT },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "hearthkeep-tool-test", version: "0.0.0" },
        },
      }),
    });
    expect(init.status).toBe(200);
    const sessionId = init.headers.get("mcp-session-id") ?? "";
    expect(sessionId).not.toBe("");
    return sessionId;
  }

  async function rpc(sessionId: string, id: number, method: string, params: unknown): Promise<{ [key: string]: unknown }> {
    const response = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: ACCEPT,
        "mcp-session-id": sessionId,
        "mcp-protocol-version": "2025-11-25",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type") ?? "").toContain("application/json");
    return (await response.json()) as { [key: string]: unknown };
  }

  async function callTool(sessionId: string, id: number, name: string, args: unknown): Promise<ToolPayload> {
    const body = await rpc(sessionId, id, "tools/call", { name, arguments: args });
    expect(body.error).toBeUndefined();
    const result = body.result as ToolPayload;
    expect(result.content).toHaveLength(1);
    expect(result.content[0]?.type).toBe("text");
    expect(sentences(result.content[0]?.text ?? "").length).toBeLessThanOrEqual(2);
    expect(sentences(result.content[0]?.text ?? "").length).toBeGreaterThan(0);
    return result;
  }

  it("lists five read-only tools whose output schemas admit an error", async () => {
    const sessionId = await session();
    const body = await rpc(sessionId, 2, "tools/list", {});
    const tools = (body.result as { tools: { name: string; annotations: { readOnlyHint: boolean; destructiveHint: boolean }; inputSchema: { type: string }; outputSchema: { anyOf: unknown[] } }[] }).tools;
    expect(tools.map((tool) => tool.name)).toEqual(TOOL_NAMES);
    for (const tool of tools) {
      expect(tool.annotations.readOnlyHint).toBe(true);
      expect(tool.annotations.destructiveHint).toBe(false);
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.outputSchema.anyOf).toHaveLength(2);
      expect(JSON.stringify(tool.outputSchema)).toContain("INVALID_ARGUMENT");
    }
  });

  it("get_upkeep_status returns attention and rejects a bad horizon", async () => {
    const sessionId = await session();
    const ok = await callTool(sessionId, 2, "get_upkeep_status", {});
    expect(ok.isError).toBe(false);
    expect(ok.structuredContent.now).toBe("2026-10-21T09:00:00-07:00");
    const attention = ok.structuredContent.attention as { applianceId: string; item: string; bucket: string }[];
    expect(attention.map((item) => [item.applianceId, item.item, item.bucket])).toEqual([
      ["ap_dryer", "vent_cleaning", "overdue"],
      ["ap_fridge", "water_filter", "due_today"],
    ]);
    expect(ok.content[0]?.text).toBe(
      "The dryer vent cleaning is overdue, and the fridge water filter is due today.",
    );

    const bad = await callTool(sessionId, 3, "get_upkeep_status", { horizonDays: 0 });
    expect(bad.isError).toBe(true);
    expect(bad.structuredContent.error).toEqual({
      code: "INVALID_ARGUMENT",
      message: "Horizon days must be a whole number from 1 to 400.",
    });
  });

  it("resolve_appliance matches the fridge and misses a garage door", async () => {
    const sessionId = await session();
    const ok = await callTool(sessionId, 2, "resolve_appliance", { query: "the fridge" });
    expect(ok.isError).toBe(false);
    expect(ok.structuredContent.status).toBe("match");
    expect(ok.structuredContent.appliance).toMatchObject({ id: "ap_fridge", spokenName: "fridge" });
    expect(ok.content[0]?.text).toContain("fridge");

    const missing = await callTool(sessionId, 3, "resolve_appliance", { query: "garage door" });
    expect(missing.isError).toBe(true);
    expect(missing.structuredContent.error).toMatchObject({ code: "APPLIANCE_NOT_FOUND" });
    expect(missing.content[0]?.text).toBe("I don't know a garage door yet. Want to add it?");
  });

  it("find_parts lists fridge filters and rejects a dryer water filter", async () => {
    const sessionId = await session();
    const ok = await callTool(sessionId, 2, "find_parts", { applianceId: "ap_fridge", item: "water_filter" });
    expect(ok.isError).toBe(false);
    expect(ok.structuredContent.recommendedAction).toBe("buy");
    expect(ok.structuredContent.onHand).toMatchObject({ qty: 0 });
    const options = ok.structuredContent.options as { optionId: string; priceUsd: string; recommended: boolean }[];
    expect(options.map((option) => [option.optionId, option.priceUsd, option.recommended])).toEqual([
      ["P-CX28", "24.99", true],
      ["P-FGWF2", "49.99", false],
    ]);
    expect(ok.structuredContent.excluded).toEqual([
      { optionId: "P-ZX28", name: "Bargo ZX-28", reason: "POLICY_UNCERTIFIED" },
    ]);

    const bad = await callTool(sessionId, 3, "find_parts", { applianceId: "ap_dryer", item: "water_filter" });
    expect(bad.isError).toBe(true);
    expect(bad.structuredContent.error).toEqual({
      code: "ITEM_NOT_APPLICABLE",
      message: "The dryer doesn't take a water filter.",
    });
    expect(bad.content[0]?.text).toBe("The dryer doesn't take a water filter.");
  });

  it("diagnose_symptom maps a chirp and misses an unknown appliance", async () => {
    const sessionId = await session();
    const ok = await callTool(sessionId, 2, "diagnose_symptom", {
      applianceId: "ap_smoke_hall",
      symptom: "keeps chirping",
    });
    expect(ok.isError).toBe(false);
    expect(ok.structuredContent).toMatchObject({
      hazard: false,
      cause: "low_battery",
      item: "battery",
      advice: "That sounds like a low battery.",
    });
    expect(ok.content[0]?.text).toBe("That sounds like a low battery.");

    const missing = await callTool(sessionId, 3, "diagnose_symptom", {
      applianceId: "ap_missing",
      symptom: "keeps chirping",
    });
    expect(missing.isError).toBe(true);
    expect(missing.structuredContent.error).toMatchObject({ code: "APPLIANCE_NOT_FOUND" });
  });

  it("find_service_slots lists vent visits and rejects a past window", async () => {
    const sessionId = await session();
    const ok = await callTool(sessionId, 2, "find_service_slots", {
      applianceId: "ap_dryer",
      item: "vent_cleaning",
      from: "2026-10-26",
      to: "2026-11-01",
    });
    expect(ok.isError).toBe(false);
    const slots = ok.structuredContent.slots as { slotId: string; provider: string; start: string; end: string; priceUsd: string; overCap: boolean }[];
    expect(slots.map((slot) => [slot.slotId, slot.provider, slot.start, slot.end, slot.priceUsd, slot.overCap])).toEqual([
      ["S-1027A", "Ventora Home Care", "2026-10-27T09:00:00-07:00", "2026-10-27T11:00:00-07:00", "89.00", true],
      ["S-1028P", "Flueline Services", "2026-10-28T13:00:00-07:00", "2026-10-28T15:00:00-07:00", "109.00", true],
      ["S-1031A", "Ventora Home Care", "2026-10-31T10:00:00-07:00", "2026-10-31T12:00:00-07:00", "99.00", true],
    ]);
    expect(ok.content[0]?.text).toBe("3 appointments are open.");

    const past = await callTool(sessionId, 3, "find_service_slots", {
      applianceId: "ap_dryer",
      item: "vent_cleaning",
      from: "2026-10-01",
      to: "2026-10-07",
    });
    expect(past.isError).toBe(true);
    expect(past.structuredContent.error).toEqual({
      code: "INVALID_ARGUMENT",
      message: "I need a date range in the future for that.",
    });
  });
});
