/**
 * QA section I, server-side cases. Fictional keys below are labels, not secrets.
 * Utterance-to-reply timing belongs to the simulator and is outside this suite.
 */
import { readFileSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startServer } from "@hearthkeep/mcp-server";
import {
  MODES,
  callTool,
  initSession,
  simFetch,
  simState,
  start,
  stop,
  tempDb,
  type Running,
} from "./qa-harness";

const DEMO_CODE = "2468";
const LLM_KEY = "fictional-llm-key-qa-label";
const DASH_KEY = "fictional-dashscope-key-qa-label";
const FORBIDDEN_FIELDS = ["address", "phone", "email", "card", "ssn", "dob"];

function walkKeys(value: unknown, found: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) walkKeys(item, found);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      found.push(key);
      walkKeys(child, found);
    }
  }
}

async function placeAndBook(running: Running, sessionId: string): Promise<void> {
  await callTool(running, sessionId, 2, "prepare_checkout", {
    items: [{ type: "part", optionId: "P-CX28", qty: 1, forApplianceId: "ap_fridge" }],
  });
  await callTool(running, sessionId, 3, "confirm_purchase", { quoteId: "q_0001", code: DEMO_CODE });
  const quote = await callTool(running, sessionId, 4, "prepare_checkout", {
    items: [{ type: "service", slotId: "S-1027A" }],
  });
  await callTool(running, sessionId, 5, "confirm_purchase", {
    quoteId: quote.structuredContent.quoteId,
    code: DEMO_CODE,
    approveOverCap: true,
  });
}

function percentile95(samples: number[]): number {
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.ceil(0.95 * sorted.length) - 1;
  return sorted[Math.max(0, index)] ?? 0;
}

function listenSockets(port: number): { v4: string[]; v6: string[] } {
  const hexPort = port.toString(16).toUpperCase().padStart(4, "0");
  const parse = (text: string): string[] => {
    const hits: string[] = [];
    for (const line of text.split("\n").slice(1)) {
      const parts = line.trim().split(/\s+/);
      const local = (parts[1] ?? "").toUpperCase();
      const state = (parts[3] ?? "").toUpperCase();
      if (!local.endsWith(`:${hexPort}`)) continue;
      if (state !== "0A") continue;
      hits.push(local.split(":")[0] ?? "");
    }
    return hits;
  };
  let v4: string[] = [];
  let v6: string[] = [];
  try {
    v4 = parse(readFileSync("/proc/net/tcp", "utf8"));
  } catch {
    v4 = [];
  }
  try {
    v6 = parse(readFileSync("/proc/net/tcp6", "utf8"));
  } catch {
    v6 = [];
  }
  return { v4, v6 };
}

describe("QA I server", () => {
  it("I84 localhost bind", async () => {
    // Same variable and default as apps/mcp-server.
    const port = Number(process.env.HK_PORT || "8787");
    const logs: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    };
    const server = startServer({
      HK_HOST: "127.0.0.1",
      HK_PORT: String(port),
      HK_DB: tempDb("i84"),
      HK_SIM_MODE: "1",
    });
    try {
      await new Promise<void>((resolve, reject) => {
        if (server.listening) resolve();
        server.once("listening", () => resolve());
        server.once("error", reject);
      });
      expect(logs.join("\n")).toContain(`listening on http://127.0.0.1:${port}/mcp`);
      const sockets = listenSockets(port);
      expect(sockets.v4).toContain("0100007F");
      expect(sockets.v4).not.toContain("00000000");
      expect(sockets.v6).toEqual([]);
    } finally {
      console.log = original;
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  it.each(MODES)("I85 redaction (%s)", async (mode) => {
    const logs: string[] = [];
    const methods = ["log", "info", "warn", "error", "debug"] as const;
    const original = methods.map((method) => console[method]);
    for (const method of methods) {
      console[method] = (...args: unknown[]) => {
        logs.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
      };
    }
    const previousLlm = process.env.HK_LLM_API_KEY;
    const previousDash = process.env.DASHSCOPE_API_KEY;
    process.env.HK_LLM_API_KEY = LLM_KEY;
    process.env.DASHSCOPE_API_KEY = DASH_KEY;
    const running = await start(mode);
    try {
      const session = await initSession(running);
      await placeAndBook(running, session.sessionId);
      const joined = logs.join("\n");
      expect(joined).not.toContain(DEMO_CODE);
      expect(joined).not.toContain(LLM_KEY);
      expect(joined).not.toContain(DASH_KEY);
    } finally {
      methods.forEach((method, index) => {
        console[method] = original[index] as (typeof console)[typeof method];
      });
      if (previousLlm === undefined) delete process.env.HK_LLM_API_KEY;
      else process.env.HK_LLM_API_KEY = previousLlm;
      if (previousDash === undefined) delete process.env.DASHSCOPE_API_KEY;
      else process.env.DASHSCOPE_API_KEY = previousDash;
      await stop(running);
    }
  });

  it("I86 no personal data", async () => {
    const notice = await readFile("docs/data-notice.md", "utf8");
    const schema = await readFile("packages/core/src/sqlite-repository.ts", "utf8");
    const schemaBody = schema.slice(schema.indexOf("CREATE TABLE"), schema.indexOf("type SqlValue"));
    const columns = [...schemaBody.matchAll(/^\s+([a-z_]+)\s+/gm)].map((match) => match[1] ?? "");
    for (const column of columns) {
      expect(FORBIDDEN_FIELDS).not.toContain(column);
    }
    const seedDir = "data/seed";
    const keys: string[] = [];
    for (const file of readdirSync(seedDir)) {
      if (!file.endsWith(".json")) continue;
      const parsed = JSON.parse(await readFile(join(seedDir, file), "utf8")) as { fictionalDataNotice?: string };
      walkKeys(parsed, keys);
      const listed = parsed.fictionalDataNotice ?? "";
      expect(listed.startsWith("Fictional data")).toBe(true);
      const marker = "Invented names in this file: ";
      const start = listed.indexOf(marker);
      expect(start).toBeGreaterThan(-1);
      const rest = listed.slice(start + marker.length);
      const clause = (rest.split(". ")[0] ?? "").replace(/\.$/, "");
      if (clause.startsWith("none")) continue;
      for (const name of clause.split(",").map((part) => part.trim()).filter((part) => part !== "")) {
        expect(notice, name).toContain(name);
      }
    }
    for (const key of keys) {
      expect(FORBIDDEN_FIELDS).not.toContain(key.toLowerCase());
    }
  });

  it.each(MODES)("I87 determinism (%s)", async (mode) => {
    const running = await start(mode);
    try {
      const session = await initSession(running);
      await placeAndBook(running, session.sessionId);
      const first = await simState(running);
      const reset = await simFetch(running, "/sim/reset", { method: "POST" });
      expect(reset.status).toBe(200);
      await placeAndBook(running, session.sessionId);
      const second = await simState(running);
      expect(second).toEqual(first);
    } finally {
      await stop(running);
    }
  });

  it.each(MODES)("I88 tool call p95 (%s)", async (mode) => {
    const running = await start(mode);
    try {
      const session = await initSession(running);
      await callTool(running, session.sessionId, 2, "get_upkeep_status", {});
      const samples: number[] = [];
      for (let round = 0; round < 3; round += 1) {
        await simFetch(running, "/sim/reset", { method: "POST" });
        const calls: Array<[string, unknown]> = [
          ["get_upkeep_status", {}],
          ["find_parts", { applianceId: "ap_fridge", item: "water_filter" }],
          ["prepare_checkout", { items: [{ type: "part", optionId: "P-CX28", qty: 1, forApplianceId: "ap_fridge" }] }],
          ["confirm_purchase", { quoteId: "q_0001", code: DEMO_CODE }],
          ["find_service_slots", { applianceId: "ap_dryer", item: "vent_cleaning", from: "2026-10-26", to: "2026-11-01" }],
          ["prepare_checkout", { items: [{ type: "service", slotId: "S-1027A" }] }],
          ["confirm_purchase", { quoteId: "q_0002", code: DEMO_CODE, approveOverCap: true }],
        ];
        let callId = 10 + round * 20;
        for (const [name, args] of calls) {
          const startedAt = performance.now();
          await callTool(running, session.sessionId, callId, name, args);
          samples.push(performance.now() - startedAt);
          callId += 1;
        }
      }
      expect(percentile95(samples)).toBeLessThan(200);
    } finally {
      await stop(running);
    }
  });
});
