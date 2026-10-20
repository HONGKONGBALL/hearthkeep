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

const env: AppEnv = process.env;
const host = textOr(env.HK_HOST, "127.0.0.1");
const port = listenPort(env.HK_PORT);
const app = createApp(env);

const server = app.listen(port, host, () => {
  console.log(`Hearthkeep MCP server listening on http://${host}:${port}`);
});

server.on("error", (err: Error) => {
  console.error(err.message);
  process.exit(1);
});
