/**
 * Browser MCP client for the local Hearthkeep server.
 * Purchase codes are passed only as tool arguments and are not stored here.
 */
import { PROTOCOL_LABEL, type ToolResponse } from "./planner";

export interface SimSnapshot {
  clock: string;
  appliances: Array<Record<string, unknown>>;
  schedule: Array<Record<string, unknown>>;
  inventory: Array<Record<string, unknown>>;
  orders: Array<Record<string, unknown>>;
  bookings: Array<Record<string, unknown>>;
  tasks: Array<Record<string, unknown>>;
  audit: Array<Record<string, unknown>>;
}

export interface HealthBody {
  status?: string;
  protocolVersion?: string;
  simNow?: string;
  storage?: string;
  payment?: string;
}

interface RpcMessage {
  result?: Record<string, unknown>;
  error?: { message?: string };
}

function parseRpc(text: string, contentType: string): RpcMessage {
  if (text.trim() === "") return {};
  if (contentType.includes("text/event-stream")) {
    const messages: unknown[] = [];
    for (const block of text.split("\n\n")) {
      const data = block
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      if (data !== "") messages.push(JSON.parse(data) as unknown);
    }
    const found = [...messages].reverse().find((message) => {
      if (message === null || typeof message !== "object") return false;
      return "result" in message || "error" in message;
    });
    return (found ?? {}) as RpcMessage;
  }
  return JSON.parse(text) as RpcMessage;
}

export class HearthkeepClient {
  sessionId: string | null = null;
  private nextId = 1;

  constructor(
    readonly baseUrl = "http://127.0.0.1:8787",
    readonly origin = "http://127.0.0.1:5173",
  ) {}

  get sessionPrefix(): string {
    return this.sessionId ? this.sessionId.slice(0, 8) : "";
  }

  private headers(withSession: boolean): Record<string, string> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      origin: this.origin,
      "mcp-protocol-version": PROTOCOL_LABEL,
    };
    if (withSession && this.sessionId) headers["mcp-session-id"] = this.sessionId;
    return headers;
  }

  private async rpc(
    method: string,
    params: unknown,
    withSession = true,
  ): Promise<{ status: number; result: Record<string, unknown>; sessionId: string | null; ms: number }> {
    const id = this.nextId;
    this.nextId += 1;
    const started = Date.now();
    const response = await fetch(`${this.baseUrl}/mcp`, {
      method: "POST",
      headers: this.headers(withSession),
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });
    const text = await response.text();
    const ms = Date.now() - started;
    const body = parseRpc(text, response.headers.get("content-type") ?? "");
    if (!response.ok || body.error) {
      const message = body.error?.message ?? `${method} failed (${response.status})`;
      throw new Error(message);
    }
    return {
      status: response.status,
      result: body.result ?? {},
      sessionId: response.headers.get("mcp-session-id"),
      ms,
    };
  }

  async initialize(): Promise<number> {
    const opened = await this.rpc(
      "initialize",
      {
        protocolVersion: PROTOCOL_LABEL,
        capabilities: {},
        clientInfo: { name: "hearthkeep-simulator", version: "0.1.0" },
      },
      false,
    );
    if (!opened.sessionId) throw new Error("MCP session was not issued");
    this.sessionId = opened.sessionId;
    const noted = await fetch(`${this.baseUrl}/mcp`, {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    });
    if (noted.status !== 202) throw new Error(`initialized notification failed (${noted.status})`);
    return opened.status;
  }

  async deleteSession(): Promise<number> {
    const response = await fetch(`${this.baseUrl}/mcp`, { method: "DELETE", headers: this.headers(true) });
    this.sessionId = null;
    return response.status;
  }

  async listResources(): Promise<Array<{ uri: string; mimeType?: string; name?: string }>> {
    const listed = await this.rpc("resources/list", {});
    const resources = listed.result.resources;
    return Array.isArray(resources) ? (resources as Array<{ uri: string; mimeType?: string; name?: string }>) : [];
  }

  async readResource(uri: string): Promise<{ mimeType: string; text: string; status: number }> {
    const read = await this.rpc("resources/read", { uri });
    const contents = read.result.contents;
    const first = Array.isArray(contents) ? (contents[0] as { mimeType?: string; text?: string } | undefined) : undefined;
    return { mimeType: first?.mimeType ?? "", text: first?.text ?? "", status: read.status };
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolResponse> {
    const called = await this.rpc("tools/call", { name, arguments: args });
    const content = called.result.content;
    const first = Array.isArray(content) ? (content[0] as { text?: string } | undefined) : undefined;
    const structured = called.result.structuredContent;
    return {
      isError: called.result.isError === true,
      text: first?.text ?? "",
      structuredContent: structured !== null && typeof structured === "object" ? (structured as Record<string, unknown>) : {},
      httpStatus: called.status,
      ms: called.ms,
      sessionPrefix: this.sessionPrefix,
      protocol: PROTOCOL_LABEL,
      raw: called.result,
    };
  }

  async health(): Promise<HealthBody> {
    const response = await fetch(`${this.baseUrl}/healthz`, { headers: { origin: this.origin } });
    if (!response.ok) throw new Error(`health ${response.status}`);
    return (await response.json()) as HealthBody;
  }

  async getSimState(): Promise<SimSnapshot> {
    const response = await fetch(`${this.baseUrl}/sim/state`, { headers: { origin: this.origin } });
    if (!response.ok) throw new Error(`sim state ${response.status}`);
    return (await response.json()) as SimSnapshot;
  }

  async advanceDays(days: number): Promise<string> {
    const response = await fetch(`${this.baseUrl}/sim/clock`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: this.origin },
      body: JSON.stringify({ advanceDays: days }),
    });
    if (!response.ok) throw new Error(`sim clock ${response.status}`);
    const body = (await response.json()) as { now?: string };
    if (!body.now) throw new Error("sim clock returned no time");
    return body.now;
  }

  async resetSim(): Promise<string> {
    const response = await fetch(`${this.baseUrl}/sim/reset`, {
      method: "POST",
      headers: { origin: this.origin },
    });
    if (!response.ok) throw new Error(`sim reset ${response.status}`);
    const body = (await response.json()) as { now?: string };
    return body.now ?? "";
  }
}
