import { randomUUID } from "node:crypto";
import express, { type Express, type Request, type Response } from "express";
import { openRepositoryFromEnv, type Repository } from "@hearthkeep/core";
import { callTool, listTools } from "./tools";

/** Protocol version this server always negotiates. Older or unknown requests still get this value. */
export const MCP_PROTOCOL_VERSION = "2025-11-25";

const SERVER_INFO = { name: "hearthkeep", version: "0.1.0" } as const;
const ALLOW_METHODS = "POST, GET, DELETE";
const ALLOW_HEADERS = "Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version, Authorization";

export interface McpEnv {
  HK_ALLOWED_ORIGINS?: string | undefined;
  HK_JSON_RESPONSE?: string | undefined;
  HK_DB?: string | undefined;
  HK_SIM_START?: string | undefined;
}

interface Session {
  protocolVersion: typeof MCP_PROTOCOL_VERSION;
}

type RpcId = string | number;

interface JsonRpcError {
  jsonrpc: "2.0";
  id: RpcId | null;
  error: { code: number; message: string };
}

interface JsonRpcResult {
  jsonrpc: "2.0";
  id: RpcId;
  result: Record<string, unknown>;
}

function allowedOrigins(env: McpEnv): Set<string> {
  const raw = env.HK_ALLOWED_ORIGINS ?? "";
  const items = raw.split(",").map((part) => part.trim()).filter((part) => part !== "");
  return new Set(items);
}

function jsonMode(env: McpEnv): boolean {
  return env.HK_JSON_RESPONSE === "1";
}

function rpcError(id: RpcId | null, code: number, message: string): JsonRpcError {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRpcId(value: unknown): value is RpcId {
  return typeof value === "string" || (typeof value === "number" && Number.isFinite(value));
}

function headerValue(req: Request, name: string): string | undefined {
  const value = req.header(name);
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function mediaType(header: string | undefined): string {
  if (header === undefined) return "";
  return header.split(";")[0]?.trim().toLowerCase() ?? "";
}

function isJsonContentType(header: string | undefined): boolean {
  return mediaType(header) === "application/json";
}

function acceptsMcp(header: string | undefined): boolean {
  if (header === undefined) return false;
  const types = new Set(header.split(",").map((part) => mediaType(part)));
  return types.has("application/json") && types.has("text/event-stream");
}

function applyCors(req: Request, res: Response, allowed: Set<string>): "absent" | "allowed" | "forbidden" {
  const origin = headerValue(req, "origin");
  if (origin === undefined) return "absent";
  if (!allowed.has(origin)) return "forbidden";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", ALLOW_METHODS);
  res.setHeader("Access-Control-Allow-Headers", ALLOW_HEADERS);
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
  res.setHeader("Vary", "Origin");
  return "allowed";
}

function sendJson(res: Response, status: number, body: unknown): void {
  res.status(status);
  res.setHeader("Content-Type", "application/json");
  res.send(JSON.stringify(body));
}

function sseEvent(payload: unknown): string {
  return `event: message\ndata: ${JSON.stringify(payload)}\n\n`;
}

function progressToken(params: unknown): RpcId | undefined {
  if (!isPlainObject(params)) return undefined;
  const meta = params._meta;
  if (!isPlainObject(meta)) return undefined;
  const token = meta.progressToken;
  return isRpcId(token) ? token : undefined;
}

function sendResult(res: Response, env: McpEnv, body: JsonRpcResult | JsonRpcError, sessionId: string | undefined, params: unknown): void {
  if (sessionId !== undefined) res.setHeader("Mcp-Session-Id", sessionId);
  if (jsonMode(env)) {
    sendJson(res, 200, body);
    return;
  }
  const token = progressToken(params);
  let stream = "";
  if (token !== undefined && "result" in body) {
    stream += sseEvent({
      jsonrpc: "2.0",
      method: "notifications/progress",
      params: { progressToken: token, progress: 1, total: 1 },
    });
  }
  stream += sseEvent(body);
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.send(stream);
}

function requestId(message: Record<string, unknown>): RpcId | null {
  return isRpcId(message.id) ? message.id : null;
}

function rejectOrigin(res: Response): void {
  sendJson(res, 403, rpcError(null, -32000, "Forbidden: Origin not allowed"));
}

function handleGet(res: Response): void {
  res.setHeader("Allow", ALLOW_METHODS);
  sendJson(res, 405, rpcError(null, -32600, "Method Not Allowed"));
}

function handleDelete(req: Request, res: Response, sessions: Map<string, Session>): void {
  const sessionId = headerValue(req, "mcp-session-id");
  if (sessionId === undefined) {
    sendJson(res, 400, rpcError(null, -32600, "Mcp-Session-Id is required"));
    return;
  }
  const version = headerValue(req, "mcp-protocol-version");
  if (version !== undefined && version !== MCP_PROTOCOL_VERSION) {
    sendJson(res, 400, rpcError(null, -32600, "Unsupported MCP-Protocol-Version"));
    return;
  }
  if (!sessions.has(sessionId)) {
    sendJson(res, 404, rpcError(null, -32001, "Session not found"));
    return;
  }
  sessions.delete(sessionId);
  res.status(200).end();
}

function handlePost(
  req: Request,
  res: Response,
  env: McpEnv,
  sessions: Map<string, Session>,
  getRepo: () => Repository,
): void {
  const contentType = req.header("content-type");
  if (!isJsonContentType(contentType)) {
    sendJson(res, 415, rpcError(null, -32600, "Content-Type must be application/json"));
    return;
  }
  if (!acceptsMcp(req.header("accept"))) {
    sendJson(res, 406, rpcError(null, -32600, "Accept must include application/json and text/event-stream"));
    return;
  }

  const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
  if (raw.trim() === "") {
    sendJson(res, 400, rpcError(null, -32700, "Parse error"));
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    sendJson(res, 400, rpcError(null, -32700, "Parse error"));
    return;
  }

  if (Array.isArray(parsed) || !isPlainObject(parsed)) {
    sendJson(res, 400, rpcError(null, -32600, "Invalid Request"));
    return;
  }

  if (parsed.jsonrpc !== "2.0") {
    sendJson(res, 400, rpcError(requestId(parsed), -32600, "Invalid Request"));
    return;
  }

  const hasMethod = Object.prototype.hasOwnProperty.call(parsed, "method");
  const hasResult = Object.prototype.hasOwnProperty.call(parsed, "result");
  const hasError = Object.prototype.hasOwnProperty.call(parsed, "error");
  const hasId = Object.prototype.hasOwnProperty.call(parsed, "id");

  if (hasMethod) {
    const method = parsed.method;
    const id = parsed.id;
    if (typeof method !== "string" || method === "") {
      sendJson(res, 400, rpcError(requestId(parsed), -32600, "Invalid Request"));
      return;
    }
    if (hasId && !isRpcId(id)) {
      sendJson(res, 400, rpcError(null, -32600, "Invalid Request"));
      return;
    }
    if (hasResult || hasError) {
      sendJson(res, 400, rpcError(requestId(parsed), -32600, "Invalid Request"));
      return;
    }
    if (!hasId) {
      if (method === "initialize") {
        sendJson(res, 400, rpcError(null, -32600, "Invalid Request"));
        return;
      }
      acceptNotification(req, res, sessions);
      return;
    }
    if (!isRpcId(id)) {
      sendJson(res, 400, rpcError(null, -32600, "Invalid Request"));
      return;
    }
    dispatchRequest(req, res, env, sessions, parsed, method, id, getRepo);
    return;
  }

  if (hasId && isRpcId(parsed.id) && (hasResult || hasError) && !(hasResult && hasError)) {
    acceptClientResponse(req, res, sessions);
    return;
  }

  sendJson(res, 400, rpcError(requestId(parsed), -32600, "Invalid Request"));
}

function acceptNotification(req: Request, res: Response, sessions: Map<string, Session>): void {
  if (!requireSession(req, res, sessions, null)) return;
  res.status(202).end();
}

function acceptClientResponse(req: Request, res: Response, sessions: Map<string, Session>): void {
  if (!requireSession(req, res, sessions, null)) return;
  res.status(202).end();
}

function requireSession(req: Request, res: Response, sessions: Map<string, Session>, id: RpcId | null): string | undefined {
  const sessionId = headerValue(req, "mcp-session-id");
  if (sessionId === undefined) {
    sendJson(res, 400, rpcError(id, -32600, "Mcp-Session-Id is required"));
    return undefined;
  }
  const version = headerValue(req, "mcp-protocol-version");
  if (version !== undefined && version !== MCP_PROTOCOL_VERSION) {
    sendJson(res, 400, rpcError(id, -32600, "Unsupported MCP-Protocol-Version"));
    return undefined;
  }
  if (!sessions.has(sessionId)) {
    sendJson(res, 404, rpcError(id, -32001, "Session not found"));
    return undefined;
  }
  return sessionId;
}

function dispatchRequest(
  req: Request,
  res: Response,
  env: McpEnv,
  sessions: Map<string, Session>,
  message: Record<string, unknown>,
  method: string,
  id: RpcId,
  getRepo: () => Repository,
): void {
  const params = message.params;
  if (params !== undefined && !isPlainObject(params)) {
    const existing = method === "initialize" ? undefined : headerValue(req, "mcp-session-id");
    sendResult(res, env, rpcError(id, -32602, "Invalid params"), existing, undefined);
    return;
  }

  if (method === "initialize") {
    const sessionId = randomUUID();
    sessions.set(sessionId, { protocolVersion: MCP_PROTOCOL_VERSION });
    sendResult(
      res,
      env,
      {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { ...SERVER_INFO },
        },
      },
      sessionId,
      params,
    );
    return;
  }

  const sessionId = requireSession(req, res, sessions, id);
  if (sessionId === undefined) return;

  if (method === "tools/list") {
    sendResult(res, env, { jsonrpc: "2.0", id, result: { tools: listTools() } }, sessionId, params);
    return;
  }

  if (method === "tools/call") {
    if (!isPlainObject(params) || typeof params.name !== "string" || params.name.trim() === "") {
      sendResult(res, env, rpcError(id, -32602, "Invalid params"), sessionId, params);
      return;
    }
    const args = Object.prototype.hasOwnProperty.call(params, "arguments") ? params.arguments : {};
    if (!isPlainObject(args)) {
      sendResult(res, env, rpcError(id, -32602, "Invalid params"), sessionId, params);
      return;
    }
    try {
      const outcome = callTool(getRepo(), params.name, args);
      if (outcome === undefined) {
        sendResult(res, env, rpcError(id, -32602, "Unknown tool"), sessionId, params);
        return;
      }
      sendResult(res, env, { jsonrpc: "2.0", id, result: { ...outcome } }, sessionId, params);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tool failed";
      sendResult(res, env, rpcError(id, -32603, message), sessionId, params);
    }
    return;
  }

  if (method === "ping") {
    sendResult(res, env, { jsonrpc: "2.0", id, result: {} }, sessionId, params);
    return;
  }

  sendResult(res, env, rpcError(id, -32601, "Method not found"), sessionId, params);
}

export function mountMcp(app: Express, env: McpEnv): void {
  const sessions = new Map<string, Session>();
  const allowed = allowedOrigins(env);
  let repository: Repository | undefined;
  const getRepo = (): Repository => {
    if (repository === undefined) repository = openRepositoryFromEnv(env);
    return repository;
  };

  const guard = (req: Request, res: Response): boolean => {
    const origin = applyCors(req, res, allowed);
    if (origin === "forbidden") {
      rejectOrigin(res);
      return false;
    }
    return true;
  };

  app.options("/mcp", (req, res) => {
    if (!guard(req, res)) return;
    res.status(204).end();
  });

  app.get("/mcp", (req, res) => {
    if (!guard(req, res)) return;
    handleGet(res);
  });

  app.delete("/mcp", (req, res) => {
    if (!guard(req, res)) return;
    handleDelete(req, res, sessions);
  });

  app.post("/mcp", express.raw({ type: () => true, limit: "1mb" }), (req, res) => {
    if (!guard(req, res)) return;
    handlePost(req, res, env, sessions, getRepo);
  });
}
