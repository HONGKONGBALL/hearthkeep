/**
 * Starts the local MCP server and simulator for Playwright.
 * Household data is the fictional seed. The database file is temporary.
 */
import { spawn } from "node:child_process";
import { openSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const ROOT = resolve(import.meta.dirname, "../..");
export const PID_FILE = resolve(ROOT, "tests/e2e/.servers.json");
export const DB_FILE = resolve(ROOT, "data/e2e.db");
export const MCP_URL = "http://127.0.0.1:8787";
export const SIM_URL = "http://127.0.0.1:5173";

export const serverEnv: NodeJS.ProcessEnv = {
  ...process.env,
  HK_HOST: "127.0.0.1",
  HK_PORT: "8787",
  HK_DB: DB_FILE,
  HK_SIM_MODE: "1",
  HK_SIM_START: "2026-10-21T09:00:00-07:00",
  HK_PURCHASE_CODE: "2468",
  HK_ALLOWED_ORIGINS: "http://localhost:5173,http://127.0.0.1:5173",
  HK_JSON_RESPONSE: "0",
  HK_AUTH_TOKEN: "",
  HK_LLM_BASE_URL: "",
  HK_LLM_API_KEY: "",
  HK_LLM_MODEL: "",
  DASHSCOPE_API_KEY: "",
};

interface Pids {
  mcp: number;
  sim: number;
}

export function readPids(): Pids {
  return JSON.parse(readFileSync(PID_FILE, "utf8")) as Pids;
}

export function writePids(pids: Pids): void {
  writeFileSync(PID_FILE, JSON.stringify(pids));
}

function logFd(name: string): number {
  return openSync(`/tmp/hearthkeep-${name}.log`, "a");
}

function launch(bin: string, args: string[], cwd: string, logName: string): number {
  const log = logFd(logName);
  const child = spawn(bin, args, {
    cwd,
    env: serverEnv,
    detached: true,
    stdio: ["ignore", log, log],
  });
  child.unref();
  if (child.pid === undefined) throw new Error(`Could not start ${bin}`);
  return child.pid;
}

export function startMcp(): number {
  return launch(resolve(ROOT, "node_modules/.bin/tsx"), ["apps/mcp-server/src/index.ts"], ROOT, "mcp");
}

export function startSim(): number {
  return launch(
    resolve(ROOT, "node_modules/.bin/vite"),
    ["--host", "127.0.0.1", "--port", "5173", "--strictPort"],
    resolve(ROOT, "apps/simulator"),
    "sim",
  );
}

export function stopPid(pid: number): void {
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* already stopped */
    }
  }
}

export async function waitForOk(url: string, timeoutMs = 25000): Promise<void> {
  const started = Date.now();
  let last = "no response";
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : "fetch failed";
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
  }
  throw new Error(`Timed out waiting for ${url}: ${last}`);
}

export async function waitForDown(url: string, timeoutMs = 10000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      await fetch(url);
    } catch {
      return;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 150));
  }
  throw new Error(`${url} is still accepting connections`);
}

export async function resetSim(): Promise<void> {
  const response = await fetch(`${MCP_URL}/sim/reset`, {
    method: "POST",
    headers: { origin: "http://127.0.0.1:5173" },
  });
  if (!response.ok) throw new Error(`sim reset failed: HTTP ${response.status}`);
}
