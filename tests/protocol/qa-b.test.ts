/**
 * QA section B. Each case runs over real HTTP in SSE and JSON modes.
 * Fictional household data from seed v1.
 */
import { describe, expect, it } from "vitest";
import {
  MODES,
  UUID_V4,
  callTool,
  h0,
  initSession,
  notifyInitialized,
  postInitialize,
  postRaw,
  rpc,
  rpcError,
  rpcResult,
  sentences,
  sessionHeaders,
  start,
  stop,
  toolError,
  type Mode,
  type Running,
} from "./qa-harness";

const TOOL_NAMES = [
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
];

const READ_ONLY = ["get_upkeep_status", "resolve_appliance", "find_parts", "diagnose_symptom", "find_service_slots"];

const VISUAL: Record<string, string> = {
  get_upkeep_status: "ui://hearthkeep/status-card.html",
  find_parts: "ui://hearthkeep/options-carousel.html",
  find_service_slots: "ui://hearthkeep/options-carousel.html",
  prepare_checkout: "ui://hearthkeep/checkout-card.html",
  confirm_purchase: "ui://hearthkeep/receipt-card.html",
  create_task: "ui://hearthkeep/task-card.html",
  log_maintenance: "ui://hearthkeep/task-card.html",
};

const MCP_APP_HTML_MIME = "text/html;profile=mcp-app";

const CARD_URIS = [
  "ui://hearthkeep/status-card.html",
  "ui://hearthkeep/options-carousel.html",
  "ui://hearthkeep/checkout-card.html",
  "ui://hearthkeep/receipt-card.html",
  "ui://hearthkeep/task-card.html",
];

function externalTargets(html: string): string[] {
  const targets: string[] = [];
  for (const match of html.matchAll(/(?:src|href)\s*=\s*(["'])([\s\S]*?)\1/gi)) {
    targets.push(match[2] ?? "");
  }
  for (const match of html.matchAll(/url\(\s*(["']?)([\s\S]*?)\1\s*\)/gi)) {
    targets.push(match[2] ?? "");
  }
  return targets;
}

async function withMode(mode: Mode, run: (running: Running) => Promise<void>): Promise<void> {
  const running = await start(mode);
  try {
    await run(running);
  } finally {
    await stop(running);
  }
}

describe.each(MODES)("QA B transport (%s)", (mode) => {
  it("B7 initialize", async () => {
    await withMode(mode, async (running) => {
      const init = await postInitialize(running);
      expect(init.status).toBe(200);
      const sessionId = init.headers.get("mcp-session-id") ?? "";
      expect(sessionId).toMatch(UUID_V4);
      expect(sessionId).toMatch(/^[\x21-\x7e]+$/);
      const result = rpcResult(init.body);
      expect(result.protocolVersion).toBe("2025-11-25");
      expect(result.serverInfo).toMatchObject({ name: "hearthkeep" });
      const capabilities = result.capabilities as { tools?: unknown; resources?: unknown };
      expect(capabilities.tools).toBeTruthy();
      expect(capabilities.resources).toBeTruthy();
    });
  });

  it("B8 initialized notification", async () => {
    await withMode(mode, async (running) => {
      const init = await postInitialize(running);
      const sessionId = init.headers.get("mcp-session-id") ?? "";
      const noted = await notifyInitialized(running, sessionId);
      expect(noted.status).toBe(202);
      expect(noted.text).toBe("");
    });
  });

  it("B9 version negotiation", async () => {
    await withMode(mode, async (running) => {
      for (const requested of ["2025-06-18", "2099-01-01"]) {
        const init = await postInitialize(running, requested);
        expect(init.status).toBe(200);
        expect(rpcResult(init.body).protocolVersion).toBe("2025-11-25");
      }
    });
  });

  it("B10 missing session", async () => {
    await withMode(mode, async (running) => {
      const response = await postRaw(
        running,
        h0({ "mcp-protocol-version": "2025-11-25" }),
        JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
        false,
      );
      expect(response.status).toBe(400);
      expect(rpcError(response.body).code).toEqual(expect.any(Number));
    });
  });

  it("B11 unknown session", async () => {
    await withMode(mode, async (running) => {
      const response = await postRaw(
        running,
        sessionHeaders("00000000-0000-4000-8000-000000000000"),
        JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
        false,
      );
      expect(response.status).toBe(404);
    });
  });

  it("B12 version header", async () => {
    await withMode(mode, async (running) => {
      const { sessionId } = await initSession(running);
      const bad = await postRaw(
        running,
        h0({ "mcp-session-id": sessionId, "mcp-protocol-version": "1999-01-01" }),
        JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
        false,
      );
      expect(bad.status).toBe(400);
      const removed = await postRaw(
        running,
        h0({ "mcp-session-id": sessionId }),
        JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/list", params: {} }),
      );
      expect(removed.status).toBe(200);
      expect(rpcResult(removed.body).tools).toBeTruthy();
    });
  });

  it("B13 accept header", async () => {
    await withMode(mode, async (running) => {
      const { sessionId } = await initSession(running);
      const response = await postRaw(
        running,
        sessionHeaders(sessionId, { accept: "application/json" }),
        JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
        false,
      );
      expect(response.status).toBe(406);
    });
  });

  it("B14 content type", async () => {
    await withMode(mode, async (running) => {
      const { sessionId } = await initSession(running);
      const response = await postRaw(
        running,
        sessionHeaders(sessionId, { "content-type": "text/plain" }),
        JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
        false,
      );
      expect(response.status).toBe(415);
    });
  });

  it("B15 malformed JSON", async () => {
    await withMode(mode, async (running) => {
      const response = await postRaw(running, h0(), '{"jsonrpc":', false);
      expect(response.status).toBe(400);
      const body = response.body as { id: unknown; error: { code: number } };
      expect(body.id).toBeNull();
      expect(body.error.code).toBe(-32700);
    });
  });

  it("B16 no batching", async () => {
    await withMode(mode, async (running) => {
      const body = JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
        { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
      ]);
      const response = await postRaw(running, h0(), body, false);
      expect(response.status).toBe(400);
      expect(rpcError(response.body).code).toBe(-32600);
    });
  });

  it("B17 origin allowlist and CORS", async () => {
    await withMode(mode, async (running) => {
      const preflight = await fetch(`${running.base}/mcp`, {
        method: "OPTIONS",
        headers: {
          origin: "http://localhost:5173",
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type, mcp-session-id, mcp-protocol-version",
        },
      });
      expect(preflight.status).toBe(204);
      expect(preflight.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
      const allow = (preflight.headers.get("access-control-allow-headers") ?? "").toLowerCase();
      expect(allow).toContain("content-type");
      expect(allow).toContain("mcp-session-id");
      expect(allow).toContain("mcp-protocol-version");
      expect(preflight.headers.get("access-control-expose-headers") ?? "").toContain("Mcp-Session-Id");

      const blocked = await postRaw(
        running,
        h0({ origin: "http://evil.example" }),
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-11-25",
            capabilities: {},
            clientInfo: { name: "qa", version: "1.0" },
          },
        }),
        false,
      );
      expect(blocked.status).toBe(403);
      expect(blocked.headers.get("mcp-session-id")).toBeNull();
      expect(rpcError(blocked.body).code).toEqual(expect.any(Number));
    });
  });

  it("B18 no standalone stream", async () => {
    await withMode(mode, async (running) => {
      const { sessionId } = await initSession(running);
      const response = await fetch(`${running.base}/mcp`, { headers: sessionHeaders(sessionId) });
      expect(response.status).toBe(405);
    });
  });

  it("B19 end session", async () => {
    await withMode(mode, async (running) => {
      const { sessionId } = await initSession(running);
      const removed = await fetch(`${running.base}/mcp`, { method: "DELETE", headers: sessionHeaders(sessionId) });
      expect(removed.status).toBe(200);
      const listed = await postRaw(
        running,
        sessionHeaders(sessionId),
        JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
        false,
      );
      expect(listed.status).toBe(404);
    });
  });

  it("B20 tool list", async () => {
    await withMode(mode, async (running) => {
      const { sessionId } = await initSession(running);
      const listed = await rpc(running, sessionId, 2, "tools/list", {});
      expect(listed.status).toBe(200);
      const tools = rpcResult(listed.body).tools as Array<{
        name: string;
        inputSchema: { type?: string };
        outputSchema?: unknown;
        annotations?: { readOnlyHint?: boolean; idempotentHint?: boolean };
        _meta?: { ui?: { resourceUri?: string } };
      }>;
      expect(tools.map((tool) => tool.name)).toEqual(TOOL_NAMES);
      for (const tool of tools) {
        expect(tool.inputSchema.type).toBe("object");
        expect(tool.outputSchema).toBeTruthy();
      }
      for (const name of READ_ONLY) {
        expect(tools.find((tool) => tool.name === name)?.annotations?.readOnlyHint).toBe(true);
      }
      expect(tools.find((tool) => tool.name === "confirm_purchase")?.annotations?.idempotentHint).toBe(true);
      const resources = rpcResult((await rpc(running, sessionId, 3, "resources/list", {})).body).resources as Array<{
        uri: string;
      }>;
      const uris = new Set(resources.map((resource) => resource.uri));
      for (const [name, uri] of Object.entries(VISUAL)) {
        const tool = tools.find((entry) => entry.name === name);
        expect(JSON.stringify(tool?._meta ?? {})).toContain(uri);
        expect(uris.has(uri)).toBe(true);
      }
    });
  });

  it("B21 card resources", async () => {
    await withMode(mode, async (running) => {
      const { sessionId } = await initSession(running);
      const listed = await rpc(running, sessionId, 2, "resources/list", {});
      const resources = rpcResult(listed.body).resources as Array<{ uri: string; mimeType: string }>;
      expect(resources.map((resource) => resource.uri)).toEqual(CARD_URIS);
      for (const resource of resources) {
        expect(resource.uri).toMatch(/^ui:\/\/hearthkeep\/.+\.html$/);
        expect(resource.mimeType).toBe(MCP_APP_HTML_MIME);
        const read = await rpc(running, sessionId, 3, "resources/read", { uri: resource.uri });
        const contents = rpcResult(read.body).contents as Array<{ mimeType: string; text: string }>;
        expect(contents).toHaveLength(1);
        expect(contents[0]?.mimeType).toBe(MCP_APP_HTML_MIME);
        const html = contents[0]?.text ?? "";
        expect(html).toContain("Fictional data");
        for (const target of externalTargets(html)) {
          expect(target).not.toMatch(/https?:\/\//i);
        }
      }
    });
  });

  it("B22 unknown tool", async () => {
    await withMode(mode, async (running) => {
      const { sessionId } = await initSession(running);
      const response = await rpc(running, sessionId, 2, "tools/call", { name: "launch_rocket", arguments: {} });
      expect(response.status).toBe(200);
      expect(rpcError(response.body).code).toBe(-32602);
    });
  });

  it("B23 invalid arguments", async () => {
    await withMode(mode, async (running) => {
      const { sessionId } = await initSession(running);
      const tool = await callTool(running, sessionId, 2, "find_parts", { applianceId: 42, item: "water_filter" });
      expect(tool.isError).toBe(true);
      const error = toolError(tool);
      expect(error.code).toBe("INVALID_ARGUMENT");
      expect(error.message).toContain("applianceId");
      expect(tool.content[0]?.text).toContain("applianceId");
      expect(sentences(tool.content[0]?.text ?? "")).toHaveLength(1);
    });
  });
});
