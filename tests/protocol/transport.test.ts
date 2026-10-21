import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createApp, type AppEnv } from "@hearthkeep/mcp-server/app";

const ACCEPT = "application/json, text/event-stream";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function initializeBody(protocolVersion: string, id: number | string = 1): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id,
    method: "initialize",
    params: {
      protocolVersion,
      capabilities: {},
      clientInfo: { name: "hearthkeep-transport-test", version: "0.0.0" },
    },
  });
}

function sseMessages(body: string): unknown[] {
  const messages: unknown[] = [];
  for (const block of body.split("\n\n")) {
    const trimmed = block.trim();
    if (trimmed === "") continue;
    const data = trimmed
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    expect(trimmed.startsWith("event: message")).toBe(true);
    expect(trimmed.includes("\nid:")).toBe(false);
    messages.push(JSON.parse(data));
  }
  return messages;
}

describe("MCP streamable HTTP /mcp", () => {
  const open: Server[] = [];

  afterEach(async () => {
    const current = open.splice(0);
    await Promise.all(current.map((server) => close(server)));
  });

  it("negotiates 2025-11-25 and lists the read-only tools over SSE", async () => {
    const started = await listen({ HK_JSON_RESPONSE: "0" });
    open.push(started.server);

    const init = await fetch(`${started.base}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: ACCEPT,
      },
      body: initializeBody("2025-03-26"),
    });
    expect(init.status).toBe(200);
    expect(init.headers.get("content-type") ?? "").toContain("text/event-stream");
    const sessionId = init.headers.get("mcp-session-id") ?? "";
    expect(sessionId).toMatch(UUID_V4);
    const initMessages = sseMessages(await init.text());
    expect(initMessages).toEqual([
      {
        jsonrpc: "2.0",
        id: 1,
        result: {
          protocolVersion: "2025-11-25",
          capabilities: {
            tools: { listChanged: false },
            resources: { listChanged: false },
          },
          serverInfo: { name: "hearthkeep", version: "0.1.0" },
        },
      },
    ]);

    const noted = await fetch(`${started.base}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: ACCEPT,
        "mcp-session-id": sessionId,
      },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    });
    expect(noted.status).toBe(202);
    expect(await noted.text()).toBe("");

    const listed = await fetch(`${started.base}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: ACCEPT,
        "mcp-session-id": sessionId,
        "mcp-protocol-version": "2025-11-25",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    });
    expect(listed.status).toBe(200);
    expect(listed.headers.get("content-type") ?? "").toContain("text/event-stream");
    expect(listed.headers.get("mcp-session-id")).toBe(sessionId);
    const listedMessages = sseMessages(await listed.text());
    expect(listedMessages).toHaveLength(1);
    expect(listedMessages[0]).toMatchObject({ jsonrpc: "2.0", id: 2 });
    const sseTools = (listedMessages[0] as { result: { tools: { name: string; annotations: { readOnlyHint: boolean } }[] } })
      .result.tools;
    expect(sseTools.map((tool) => tool.name)).toEqual([
      "get_upkeep_status",
      "resolve_appliance",
      "register_appliance",
      "find_parts",
      "diagnose_symptom",
      "find_service_slots",
      "prepare_checkout",
      "confirm_purchase",
      "create_task",
      "log_maintenance",
    ]);
    const readOnlyNames = new Set(["get_upkeep_status", "resolve_appliance", "find_parts", "diagnose_symptom", "find_service_slots"]);
    expect(sseTools.filter((tool) => readOnlyNames.has(tool.name)).every((tool) => tool.annotations.readOnlyHint === true)).toBe(true);
    expect(sseTools.filter((tool) => !readOnlyNames.has(tool.name)).every((tool) => tool.annotations.readOnlyHint === false)).toBe(true);
  });

  it("returns application/json when HK_JSON_RESPONSE=1", async () => {
    const started = await listen({ HK_JSON_RESPONSE: "1" });
    open.push(started.server);

    const init = await fetch(`${started.base}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: ACCEPT },
      body: initializeBody("2025-11-25", "init-1"),
    });
    expect(init.status).toBe(200);
    expect(init.headers.get("content-type") ?? "").toContain("application/json");
    const sessionId = init.headers.get("mcp-session-id") ?? "";
    expect(sessionId).toMatch(UUID_V4);
    await expect(init.json()).resolves.toMatchObject({
      id: "init-1",
      result: { protocolVersion: "2025-11-25" },
    });

    const listed = await fetch(`${started.base}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: ACCEPT,
        "mcp-session-id": sessionId,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: "tools-1", method: "tools/list" }),
    });
    expect(listed.status).toBe(200);
    expect(listed.headers.get("content-type") ?? "").toContain("application/json");
    const listedJson = (await listed.json()) as {
      jsonrpc: string;
      id: string;
      result: { tools: { name: string }[] };
    };
    expect(listedJson).toMatchObject({ jsonrpc: "2.0", id: "tools-1" });
    expect(listedJson.result.tools.map((tool) => tool.name)).toEqual([
      "get_upkeep_status",
      "resolve_appliance",
      "register_appliance",
      "find_parts",
      "diagnose_symptom",
      "find_service_slots",
      "prepare_checkout",
      "confirm_purchase",
      "create_task",
      "log_maintenance",
    ]);
  });

  it("rejects bad content, origin, session, and version, and ends a session on DELETE", async () => {
    const started = await listen({
      HK_ALLOWED_ORIGINS: "http://localhost:5173, http://127.0.0.1:5173",
    });
    open.push(started.server);
    const url = `${started.base}/mcp`;
    const jsonHeaders = { "content-type": "application/json", accept: ACCEPT };

    const preflight = await fetch(url, {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "POST",
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    expect(preflight.headers.get("access-control-allow-methods")).toBe("POST, GET, DELETE");
    expect(preflight.headers.get("access-control-allow-headers")).toBe(
      "Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version, Authorization",
    );
    expect(preflight.headers.get("access-control-expose-headers")).toBe("Mcp-Session-Id");
    expect(await preflight.text()).toBe("");

    const blocked = await fetch(url, {
      method: "POST",
      headers: { ...jsonHeaders, origin: "https://evil.example" },
      body: initializeBody("2025-11-25"),
    });
    expect(blocked.status).toBe(403);
    expect(blocked.headers.get("mcp-session-id")).toBeNull();
    await expect(blocked.json()).resolves.toMatchObject({
      jsonrpc: "2.0",
      error: { code: -32000 },
    });

    const allowed = await fetch(url, {
      method: "POST",
      headers: { ...jsonHeaders, origin: "http://127.0.0.1:5173" },
      body: initializeBody("2024-11-05", 7),
    });
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:5173");
    expect(allowed.headers.get("access-control-expose-headers")).toBe("Mcp-Session-Id");
    const sessionId = allowed.headers.get("mcp-session-id") ?? "";
    expect(sessionId).toMatch(UUID_V4);
    const allowedBody = sseMessages(await allowed.text());
    expect(allowedBody[0]).toMatchObject({ id: 7, result: { protocolVersion: "2025-11-25" } });

    const get = await fetch(url);
    expect(get.status).toBe(405);

    const unsupported = await fetch(url, {
      method: "POST",
      headers: { "content-type": "text/plain", accept: ACCEPT },
      body: initializeBody("2025-11-25"),
    });
    expect(unsupported.status).toBe(415);

    const notAcceptable = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: initializeBody("2025-11-25"),
    });
    expect(notAcceptable.status).toBe(406);

    const parseError = await fetch(url, {
      method: "POST",
      headers: jsonHeaders,
      body: "{",
    });
    expect(parseError.status).toBe(400);
    await expect(parseError.json()).resolves.toMatchObject({ error: { code: -32700 } });

    const batch = await fetch(url, {
      method: "POST",
      headers: jsonHeaders,
      body: "[]",
    });
    expect(batch.status).toBe(400);
    await expect(batch.json()).resolves.toMatchObject({ error: { code: -32600 } });

    const missingSession = await fetch(url, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/list" }),
    });
    expect(missingSession.status).toBe(400);

    const badVersion = await fetch(url, {
      method: "POST",
      headers: { ...jsonHeaders, "mcp-session-id": sessionId, "mcp-protocol-version": "2025-03-26" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/list" }),
    });
    expect(badVersion.status).toBe(400);

    const removed = await fetch(url, {
      method: "DELETE",
      headers: { "mcp-session-id": sessionId, origin: "http://localhost:5173" },
    });
    expect(removed.status).toBe(200);
    expect(removed.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");

    const again = await fetch(url, {
      method: "POST",
      headers: { ...jsonHeaders, "mcp-session-id": sessionId },
      body: JSON.stringify({ jsonrpc: "2.0", id: 5, method: "tools/list" }),
    });
    expect(again.status).toBe(404);

    const deletedAgain = await fetch(url, { method: "DELETE", headers: { "mcp-session-id": sessionId } });
    expect(deletedAgain.status).toBe(404);
  });
});
