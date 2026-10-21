import type { Server } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createApp, type AppEnv } from "./app";

function textOr(value: string | undefined, fallback: string): string {
  if (value === undefined || value.trim() === "") return fallback;
  return value;
}

function listenPort(raw: string | undefined): number {
  const text = textOr(raw, "8787");
  if (!/^[0-9]+$/.test(text)) {
    throw new Error(`HK_PORT must be an integer from 1 to 65535, received ${text}`);
  }
  const port = Number(text);
  if (port < 1 || port > 65535) {
    throw new Error(`HK_PORT must be an integer from 1 to 65535, received ${text}`);
  }
  return port;
}

/** Bind the MCP server and log the localhost URL. The demo script runs this file directly. */
export function startServer(env: AppEnv = process.env): Server {
  const host = textOr(env.HK_HOST, "127.0.0.1");
  const port = listenPort(env.HK_PORT);
  const app = createApp(env);
  return app.listen(port, host, () => {
    console.log(`Hearthkeep MCP server listening on http://${host}:${port}/mcp`);
  });
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (entry === undefined || entry.trim() === "") return false;
  return import.meta.url === pathToFileURL(resolve(entry)).href;
}

if (isDirectRun()) {
  const server = startServer();
  server.on("error", (err: Error) => {
    console.error(err.message);
    process.exit(1);
  });
}
