import { rmSync } from "node:fs";
import { DB_FILE, PID_FILE, readPids, stopPid } from "./servers";

export default function globalTeardown(): void {
  try {
    const pids = readPids();
    stopPid(pids.mcp);
    stopPid(pids.sim);
  } catch {
    /* setup may have failed before writing pids */
  }
  rmSync(PID_FILE, { force: true });
  rmSync(DB_FILE, { force: true });
  rmSync(`${DB_FILE}-journal`, { force: true });
  rmSync(`${DB_FILE}-wal`, { force: true });
  rmSync(`${DB_FILE}-shm`, { force: true });
}
