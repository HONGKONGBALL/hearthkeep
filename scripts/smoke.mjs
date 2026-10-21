/**
 * Talks to a running Hearthkeep demo (npm run demo).
 * Initializes a session, lists tools, and calls get_upkeep_status.
 * Fictional seed data only. No secrets.
 */
const host = process.env.HK_HOST && process.env.HK_HOST !== "0.0.0.0" ? process.env.HK_HOST : "127.0.0.1";
const port = process.env.HK_PORT || "8787";
const base = `http://${host}:${port}`;
const ACCEPT = "application/json, text/event-stream";

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseSse(text) {
  const messages = [];
  for (const block of text.split("\n\n")) {
    const trimmed = block.trim();
    if (trimmed === "") continue;
    const dataLine = trimmed.split("\n").find((line) => line.startsWith("data:"));
    if (dataLine === undefined) fail(`SSE block has no data: ${trimmed}`);
    messages.push(JSON.parse(dataLine.slice("data:".length).trim()));
  }
  if (messages.length === 0) fail("empty SSE response");
  return messages[messages.length - 1];
}

async function post(path, body, headers) {
  let response;
  try {
    response = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: ACCEPT,
        ...headers,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    fail(`Cannot reach ${base}. Start the demo with npm run demo. ${error instanceof Error ? error.message : ""}`);
  }
  const type = response.headers.get("content-type") ?? "";
  const text = await response.text();
  if (response.status !== 200 && response.status !== 202) {
    fail(`HTTP ${response.status} from ${path}: ${text}`);
  }
  if (response.status === 202) return { response, message: null };
  if (!type.includes("text/event-stream") && !type.includes("application/json")) {
    fail(`Unexpected content type ${type}`);
  }
  const message = type.includes("application/json") ? JSON.parse(text) : parseSse(text);
  return { response, message };
}

const init = await post("/mcp", {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "hearthkeep-smoke", version: "0.1.0" },
  },
});
const sessionId = init.response.headers.get("mcp-session-id") ?? "";
if (!/^[0-9a-f-]{36}$/i.test(sessionId)) fail(`Missing session id from initialize`);
const protocolVersion = init.message?.result?.protocolVersion;
if (protocolVersion !== "2025-11-25") fail(`protocolVersion ${protocolVersion}`);
if (init.message?.result?.serverInfo?.name !== "hearthkeep") fail("serverInfo.name is not hearthkeep");

await post(
  "/mcp",
  { jsonrpc: "2.0", method: "notifications/initialized" },
  { "mcp-session-id": sessionId },
);

const listed = await post(
  "/mcp",
  { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
  { "mcp-session-id": sessionId, "mcp-protocol-version": "2025-11-25" },
);
const tools = listed.message?.result?.tools;
if (!Array.isArray(tools)) fail("tools/list did not return tools");
const names = tools.map((tool) => tool.name);
if (!names.includes("get_upkeep_status")) fail(`tools/list missing get_upkeep_status: ${names.join(", ")}`);

const called = await post(
  "/mcp",
  { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_upkeep_status", arguments: {} } },
  { "mcp-session-id": sessionId, "mcp-protocol-version": "2025-11-25" },
);
const result = called.message?.result;
if (!result || result.isError) fail(`get_upkeep_status failed: ${JSON.stringify(called.message)}`);
const now = result.structuredContent?.now;
if (typeof now !== "string" || now.trim() === "") fail("get_upkeep_status missing structuredContent.now");
const text = result.content?.[0]?.text;
if (typeof text !== "string" || text.trim() === "") fail("get_upkeep_status missing speakable text");

console.log("smoke ok");
console.log(`protocol ${protocolVersion}`);
console.log(`session ${sessionId}`);
console.log(`tools ${names.length}`);
console.log(`upkeep now ${now}`);
console.log(text);
