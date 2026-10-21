/**
 * Real HTTP helpers for the Hearthkeep QA protocol suites.
 * The purchase code used by callers is the fictional demo code from seed v1.
 */
import { createServer, type Server } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp, type AppEnv } from "@hearthkeep/mcp-server/app";

export const MODES = ["sse", "json"] as const;
export type Mode = (typeof MODES)[number];

export const ACCEPT = "application/json, text/event-stream";
export const ORIGIN = "http://localhost:5173";
export const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface Running {
  mode: Mode;
  base: string;
  server: Server;
  dbPath: string;
}

export interface HttpResult {
  status: number;
  headers: Headers;
  text: string;
  body: unknown;
}

export interface ToolContent {
  type: string;
  text: string;
}

export interface ToolBody {
  content: ToolContent[];
  structuredContent: { [key: string]: unknown };
  isError?: boolean;
}

export interface RpcErrorBody {
  code: number;
  message: string;
}

export async function start(mode: Mode, extra: AppEnv = {}): Promise<Running> {
  const env: AppEnv = {
    HK_SIM_MODE: "1",
    HK_DB: ":memory:",
    ...extra,
    HK_JSON_RESPONSE: mode === "json" ? "1" : "0",
  };
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
  return { mode, base: `http://127.0.0.1:${address.port}`, server, dbPath: env.HK_DB ?? ":memory:" };
}

export function tempDb(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `hearthkeep-${name}-`));
  return join(dir, "hk.sqlite");
}

export function stop(running: Running): Promise<void> {
  return new Promise((resolve, reject) => {
    running.server.close((err) => (err ? reject(err) : resolve()));
  });
}

export function h0(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "content-type": "application/json",
    accept: ACCEPT,
    origin: ORIGIN,
    ...extra,
  };
}

export function sessionHeaders(sessionId: string, extra: Record<string, string> = {}): Record<string, string> {
  return h0({
    "mcp-session-id": sessionId,
    "mcp-protocol-version": "2025-11-25",
    ...extra,
  });
}

export function sentences(text: string): string[] {
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

export function parseSse(body: string): unknown[] {
  const messages: unknown[] = [];
  for (const block of body.split("\n\n")) {
    const trimmed = block.trim();
    if (trimmed === "") continue;
    const data = trimmed
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    if (data === "") continue;
    messages.push(JSON.parse(data));
  }
  return messages;
}

async function readHttp(response: Response, mode: Mode, expectRpcBody: boolean): Promise<HttpResult> {
  const text = await response.text();
  const type = response.headers.get("content-type") ?? "";
  if (expectRpcBody && response.status === 200) {
    if (mode === "json" && !type.includes("application/json")) {
      throw new Error(`JSON mode returned ${type || "no content type"}: ${text.slice(0, 180)}`);
    }
    if (mode === "sse" && !type.includes("text/event-stream")) {
      throw new Error(`SSE mode returned ${type || "no content type"}: ${text.slice(0, 180)}`);
    }
  }
  if (text === "") return { status: response.status, headers: response.headers, text, body: null };
  if (type.includes("text/event-stream")) {
    const messages = parseSse(text);
    const rpc = [...messages].reverse().find((message) => {
      if (message === null || typeof message !== "object") return false;
      return "result" in message || "error" in message;
    });
    return { status: response.status, headers: response.headers, text, body: rpc ?? null };
  }
  return { status: response.status, headers: response.headers, text, body: JSON.parse(text) as unknown };
}

export async function postRaw(
  running: Running,
  headers: Record<string, string>,
  body: string,
  expectRpcBody = true,
): Promise<HttpResult> {
  const response = await fetch(`${running.base}/mcp`, { method: "POST", headers, body });
  return readHttp(response, running.mode, expectRpcBody);
}

export function initializeMessage(protocolVersion: string, id: number | string = 1): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id,
    method: "initialize",
    params: {
      protocolVersion,
      capabilities: {},
      clientInfo: { name: "qa", version: "1.0" },
    },
  });
}

export async function postInitialize(running: Running, protocolVersion = "2025-11-25", id: number | string = 1): Promise<HttpResult> {
  return postRaw(running, h0(), initializeMessage(protocolVersion, id));
}

export async function notifyInitialized(running: Running, sessionId: string): Promise<HttpResult> {
  const response = await fetch(`${running.base}/mcp`, {
    method: "POST",
    headers: sessionHeaders(sessionId),
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });
  return readHttp(response, running.mode, false);
}

/** INIT from the QA conventions: initialize, then notifications/initialized. */
export async function initSession(running: Running, protocolVersion = "2025-11-25"): Promise<{ sessionId: string; init: HttpResult }> {
  const init = await postInitialize(running, protocolVersion);
  const sessionId = init.headers.get("mcp-session-id") ?? "";
  if (init.status !== 200 || sessionId === "") {
    throw new Error(`initialize failed (${init.status}): ${init.text.slice(0, 240)}`);
  }
  const noted = await notifyInitialized(running, sessionId);
  if (noted.status !== 202 || noted.text !== "") {
    throw new Error(`initialized notification failed (${noted.status}): ${noted.text.slice(0, 180)}`);
  }
  return { sessionId, init };
}

export async function rpc(
  running: Running,
  sessionId: string,
  id: number,
  method: string,
  params: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<HttpResult> {
  return postRaw(
    running,
    sessionHeaders(sessionId, extraHeaders),
    JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  );
}

export function rpcResult(body: unknown): { [key: string]: unknown } {
  if (body === null || typeof body !== "object" || !("result" in body)) {
    throw new Error(`expected a JSON-RPC result, received ${JSON.stringify(body)}`);
  }
  const result = (body as { result: unknown }).result;
  if (result === null || typeof result !== "object") throw new Error("result is not an object");
  return result as { [key: string]: unknown };
}

export function rpcError(body: unknown): RpcErrorBody {
  if (body === null || typeof body !== "object" || !("error" in body)) {
    throw new Error(`expected a JSON-RPC error, received ${JSON.stringify(body)}`);
  }
  const error = (body as { error: RpcErrorBody }).error;
  return error;
}

export function asTool(body: unknown): ToolBody {
  const result = rpcResult(body) as unknown as ToolBody;
  if (!Array.isArray(result.content) || result.content.length === 0) {
    throw new Error(`tool result has no content: ${JSON.stringify(body)}`);
  }
  return result;
}

export async function callTool(
  running: Running,
  sessionId: string,
  id: number,
  name: string,
  args: unknown,
): Promise<ToolBody> {
  const response = await rpc(running, sessionId, id, "tools/call", { name, arguments: args });
  if (response.status !== 200) throw new Error(`tools/call HTTP ${response.status}: ${response.text.slice(0, 240)}`);
  return asTool(response.body);
}

export async function simFetch(running: Running, path: string, init: RequestInit = {}): Promise<HttpResult> {
  const headers = new Headers(init.headers);
  if (!headers.has("origin")) headers.set("origin", ORIGIN);
  const response = await fetch(`${running.base}${path}`, { ...init, headers });
  const text = await response.text();
  const body = text === "" ? null : (JSON.parse(text) as unknown);
  return { status: response.status, headers: response.headers, text, body };
}

export async function simState(running: Running): Promise<{ [key: string]: unknown }> {
  const response = await simFetch(running, "/sim/state");
  if (response.status !== 200 || response.body === null || typeof response.body !== "object") {
    throw new Error(`GET /sim/state failed (${response.status}): ${response.text.slice(0, 240)}`);
  }
  return response.body as { [key: string]: unknown };
}

export function toolError(tool: ToolBody): { code: string; message: string; attemptsRemaining?: number } {
  const error = tool.structuredContent.error as { code?: string; message?: string; attemptsRemaining?: number } | undefined;
  if (error === undefined || typeof error.code !== "string") throw new Error(`missing tool error: ${JSON.stringify(tool)}`);
  return error as { code: string; message: string; attemptsRemaining?: number };
}

export function contains(text: string, needle: string): boolean {
  return text.toLowerCase().includes(needle.toLowerCase());
}
