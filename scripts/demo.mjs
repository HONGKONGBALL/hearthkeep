import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const DEFAULTS = {
  HK_HOST: "127.0.0.1",
  HK_PORT: "8787",
  HK_DB: "./data/hearthkeep.db",
  HK_ALLOWED_ORIGINS: "http://localhost:5173,http://127.0.0.1:5173",
  HK_SIM_MODE: "1",
  HK_SIM_START: "2026-10-21T09:00:00-07:00",
  HK_PURCHASE_CODE: "2468",
  HK_JSON_RESPONSE: "0",
};

function parseEnvFile(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const body = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const eq = body.indexOf("=");
    if (eq <= 0) continue;
    const key = body.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = body.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function loadDemoEnv() {
  const envName = existsSync(resolve(root, ".env")) ? ".env" : ".env.example";
  const fileValues = parseEnvFile(readFileSync(resolve(root, envName), "utf8"));
  const env = { ...process.env };
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (env[key] === undefined) env[key] = value;
  }
  for (const [key, value] of Object.entries(fileValues)) {
    if (process.env[key] === undefined) env[key] = value;
  }
  return { envName, env };
}

function bin(name) {
  const path = resolve(root, "node_modules", ".bin", name);
  if (!existsSync(path)) {
    console.error(`Missing ${path}. Run npm ci from the repository root.`);
    process.exit(1);
  }
  return path;
}

const { envName, env } = loadDemoEnv();
const children = [];
let shuttingDown = false;

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
    }
  }
  setTimeout(() => {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
    }
    process.exit(code);
  }, 1500).unref();
}

function start(command, args, cwd) {
  const child = spawn(command, args, { cwd, env, stdio: "inherit" });
  children.push(child);
  child.on("error", (err) => {
    console.error(err.message);
    shutdown(1);
  });
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    const status = typeof code === "number" && code !== 0 ? code : 1;
    console.error(`process exited (${signal ?? code ?? "unknown"}): ${command} ${args.join(" ")}`);
    shutdown(status);
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const host = env.HK_HOST || "127.0.0.1";
const port = env.HK_PORT || "8787";
console.log("Hearthkeep demo");
console.log(`env file: ${envName}`);
console.log(`MCP server  http://${host}:${port}`);
console.log("simulator   http://127.0.0.1:5173");

start(bin("tsx"), ["apps/mcp-server/src/index.ts"], root);
start(bin("vite"), ["--host", "127.0.0.1", "--port", "5173", "--strictPort"], resolve(root, "apps/simulator"));
