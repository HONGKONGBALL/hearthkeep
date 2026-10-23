# Spec notes

Recorded 2026-10-22 for the rc2 tree. This is the Day-0 check of MCP `2025-11-25` Streamable HTTP and the MCP Apps UI resources. The rows describe `apps/mcp-server` and `apps/simulator`. Protocol cases live in `tests/protocol`. Card cases live in `tests/cards.test.ts` and in `tests/protocol/qa-b.test.ts` case B21.

## Sources

- Lifecycle and version negotiation: [MCP 2025-11-25 lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle). The client sends a version it supports. If the server supports that version it returns the same version. Otherwise it returns a version it supports.
- Streamable HTTP: [MCP 2025-11-25 transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports). A server may issue `Mcp-Session-Id` on `initialize`. The id is visible ASCII. A later request without that id is HTTP 400 when the server requires one. After initialization the client sends `MCP-Protocol-Version`. If that header is absent, the server may use the version negotiated at initialization.
- MCP Apps linking: tool metadata `_meta.ui.resourceUri`, resource MIME `text/html;profile=mcp-app`, `ui://` resources rendered in a sandboxed frame. The extension docs describe that shape at [MCP Apps](https://apps.extensions.modelcontextprotocol.io/).

`package-lock.json` does not contain `@modelcontextprotocol/sdk` or `@modelcontextprotocol/ext-apps`. The server is the Express handler in `apps/mcp-server/src/mcp.ts`. `initialize` always answers `protocolVersion` `2025-11-25`, which is the only version this server supports.

## Transport

| Check | Result here | Test |
|---|---|---|
| Negotiated version | `initialize` returns `2025-11-25` when the client sends `2025-11-25`, `2025-06-18`, or `2099-01-01`. | B7, B9 |
| Server info | `serverInfo.name` is `hearthkeep`, version `0.1.0`. Capabilities advertise `tools` and `resources`, both with `listChanged: false`. | B7 |
| Session id | `Mcp-Session-Id` is a UUID v4 of visible ASCII (`0x21`–`0x7E`). | B7 |
| Initialized notification | `notifications/initialized` with that session returns `202` and an empty body. | B8 |
| Missing session | A non-initialize request without `Mcp-Session-Id` returns `400`. | B10 |
| Unknown or ended session | Returns `404`. | B11, B19 |
| Protocol header | `MCP-Protocol-Version` other than `2025-11-25` returns `400`. A missing header is accepted. | B12 |
| Accept | `Accept` must include both `application/json` and `text/event-stream`, or the response is `406`. | B13 |
| Content-Type | A body that is not `application/json` returns `415`. | B14 |
| Parse error | Unparsable JSON returns `400` with code `-32700`. | B15 |
| Batching | A JSON array returns `400` with code `-32600`. One message per POST. | B16 |
| Origin | An origin outside `HK_ALLOWED_ORIGINS` returns `403` with a JSON-RPC body and no session. A request with no Origin is allowed. | B17 |
| CORS | An allowlisted `OPTIONS` returns `204`. Allowed methods are `POST`, `GET`, `DELETE`. Allowed headers are `Content-Type`, `Accept`, `Mcp-Session-Id`, `MCP-Protocol-Version`, `Authorization`. `Access-Control-Expose-Headers` is `Mcp-Session-Id`. | `tests/protocol/transport.test.ts` |
| GET | `GET /mcp` returns `405` and a JSON-RPC error. This server does not open a standalone SSE stream and does not push server-initiated messages. | B18 |
| DELETE | `DELETE /mcp` for a live session returns `200` with an empty body and drops the session. A later call with that id returns `404`. | B19 |
| Response body | The default `POST` response is `200` `text/event-stream`: one `event: message` block and no event id. `HK_JSON_RESPONSE=1` returns `application/json` instead. | `tests/protocol/transport.test.ts` |
| Progress | When the request carries `_meta.progressToken` and the response is SSE, the handler writes one `notifications/progress` event (`progress` 1, `total` 1) before the result. JSON mode sends only the result. There is no resume cursor. | `apps/mcp-server/src/mcp.ts` |
| Tools | `tools/list` returns the ten P0 tools. An unknown name on `tools/call` is `-32602`. Invalid arguments are `-32602`. A domain failure is a tool result with `isError: true` and `structuredContent.error.code`. | B20, B22, B23 |
| Ping | `ping` returns an empty result object. | `apps/mcp-server/src/mcp.ts` |
| Auth | `HK_AUTH_TOKEN` is not read. There is no `401` bearer check. `Authorization` is only a CORS allow-header. | server source |

Sessions are stored in the process that created the app. A restart ends them. Household rows stay in SQLite.

## MCP Apps

Pinned for this host and this server:

| Item | Value |
|---|---|
| MIME type | `text/html;profile=mcp-app` |
| Tool link | `_meta.ui.resourceUri` on the tool descriptor from `tools/list` |
| URIs | `ui://hearthkeep/status-card.html`, `ui://hearthkeep/options-carousel.html`, `ui://hearthkeep/checkout-card.html`, `ui://hearthkeep/receipt-card.html`, `ui://hearthkeep/task-card.html` |
| Discovery | `resources/list` returns those five URIs. `resources/read` returns `{ uri, mimeType, text }`. |
| HTML | Inline CSS and JS. No network URL in the card. A control posts an utterance. It does not call a tool. |
| Host to card | `postMessage` `{ source: "hearthkeep-host", type: "tool-result", tool, structuredContent, context }` |
| Card to host | `postMessage` `{ source: "hearthkeep-card", type: "intent", utterance }` and `{ source: "hearthkeep-card", type: "ready" }` |
| Frame | One iframe, `sandbox="allow-scripts"`. The host injects the HTML. |

The flat legacy key `_meta["ui/resourceUri"]` is not set. `initialize` does not list the five URIs. The list is `resources/list`, and each visual tool points at its URI.

`@modelcontextprotocol/ext-apps` is not installed, and `initialize` does not advertise `capabilities.extensions`. The simulator is the host that understands the message names above. A host that expects the extension package's JSON-RPC app bridge will not drive these frames. `tests/cards.test.ts` and B21 lock the MIME type, the URIs, and the tool links.

## Speech

Replies in the simulator are on-screen text from the deterministic planner. With Voice on, the page also speaks that reply through the browser `speechSynthesis` API. `npm run demo` and `npm test` do not call a TTS endpoint. Narration for the video script is `scripts/narrate-demo.mjs`, which reads `DASHSCOPE_API_KEY` from the environment first (falling back to a local secrets file only when the variable is unset) and is not part of the product server.
