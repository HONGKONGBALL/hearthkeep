import { rmSync } from "node:fs";
import { DB_FILE, SIM_URL, MCP_URL, resetSim, startMcp, startSim, waitForOk, writePids } from "./servers";

export default async function globalSetup(): Promise<void> {
  rmSync(DB_FILE, { force: true });
  rmSync(`${DB_FILE}-journal`, { force: true });
  rmSync(`${DB_FILE}-wal`, { force: true });
  rmSync(`${DB_FILE}-shm`, { force: true });
  const mcp = startMcp();
  const sim = startSim();
  writePids({ mcp, sim });
  try {
    await waitForOk(`${MCP_URL}/healthz`);
    await waitForOk(SIM_URL);
    await fetch(`${SIM_URL}/`);
    await fetch(`${SIM_URL}/src/main.tsx`);
    await fetch(`${SIM_URL}/src/App.tsx`);
    await resetSim();
  } catch (error) {
    const { readPids, stopPid } = await import("./servers");
    const pids = readPids();
    stopPid(pids.mcp);
    stopPid(pids.sim);
    throw error;
  }
}
