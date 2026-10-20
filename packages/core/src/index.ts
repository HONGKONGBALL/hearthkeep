/** MCP protocol version this server advertises. */
export const PROTOCOL_VERSION = "2025-11-25" as const;

/** Seed clock for the simulation: Wednesday 21 October 2026, 09:00, US Pacific. */
export const DEFAULT_SIM_START = "2026-10-21T09:00:00-07:00";

export interface HealthReport {
  status: "ok";
  protocolVersion: typeof PROTOCOL_VERSION;
  storage: "sqlite";
  payment: "mock";
  simMode: boolean;
  simNow: string;
}

export interface HealthEnv {
  HK_SIM_MODE?: string | undefined;
  HK_SIM_START?: string | undefined;
}

/**
 * `HK_SIM_MODE` defaults to on so `npm run demo` matches the zero-key contract.
 * Only the exact value "1" enables simulation mode. "0" disables it.
 * `HK_SIM_START` is returned unchanged so the offset in the seed clock is preserved.
 */
export function healthReport(env: HealthEnv = {}): HealthReport {
  const simMode = env.HK_SIM_MODE === undefined ? true : env.HK_SIM_MODE === "1";
  const configured = env.HK_SIM_START;
  const simNow =
    configured === undefined || configured.trim() === "" ? DEFAULT_SIM_START : configured;
  return {
    status: "ok",
    protocolVersion: PROTOCOL_VERSION,
    storage: "sqlite",
    payment: "mock",
    simMode,
    simNow,
  };
}
