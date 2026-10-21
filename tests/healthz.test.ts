import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createApp, type AppEnv } from "@hearthkeep/mcp-server/app";

async function listen(env: AppEnv): Promise<{ base: string; server: Server }> {
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
  return { base: `http://127.0.0.1:${address.port}`, server };
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

describe("GET /healthz", () => {
  const open: Server[] = [];

  afterEach(async () => {
    const current = open.splice(0);
    await Promise.all(current.map((server) => close(server)));
  });

  it("returns the zero-key demo payload", async () => {
    const started = await listen({
      HK_DB: ":memory:",
      HK_SIM_MODE: "1",
      HK_SIM_START: "2026-10-21T09:00:00-07:00",
    });
    open.push(started.server);

    const response = await fetch(`${started.base}/healthz`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type") ?? "").toContain("application/json");
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      protocolVersion: "2025-11-25",
      storage: "sqlite",
      payment: "mock",
      simMode: true,
      simNow: "2026-10-21T09:00:00-07:00",
    });
  });

  it("uses the seed clock when unset and reports simMode false when HK_SIM_MODE=0", async () => {
    const defaults = await listen({ HK_DB: ":memory:" });
    open.push(defaults.server);
    const defaultResponse = await fetch(`${defaults.base}/healthz`);
    expect(defaultResponse.status).toBe(200);
    await expect(defaultResponse.json()).resolves.toMatchObject({
      status: "ok",
      protocolVersion: "2025-11-25",
      storage: "sqlite",
      payment: "mock",
      simMode: true,
      simNow: "2026-10-21T09:00:00-07:00",
    });

    const disabled = await listen({ HK_DB: ":memory:", HK_SIM_MODE: "0" });
    open.push(disabled.server);
    const disabledResponse = await fetch(`${disabled.base}/healthz`);
    expect(disabledResponse.status).toBe(200);
    await expect(disabledResponse.json()).resolves.toMatchObject({ simMode: false });
  });
});
