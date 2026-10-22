# Architecture

Hearthkeep is two local processes. The browser host turns a spoken line into tool calls. The MCP server applies the domain rules and stores the fictional household in SQLite. Sample names, prices, and appointments are fictional.

## Processes

| Process | Address | Role |
|---|---|---|
| `apps/mcp-server` | `http://127.0.0.1:8787` | Express. `POST /mcp` speaks MCP `2025-11-25` over Streamable HTTP. `GET /healthz` and `/sim/*` sit beside that endpoint. |
| `apps/simulator` | `http://127.0.0.1:5173` | Vite + React. Device frame, welcome disclosure, quick chips, deterministic planner, card iframes, trace, and data drawer. |
| `packages/core` | in process | Domain rules and the SQLite repository (`better-sqlite3`). |

`npm run demo` starts the server and the simulator. The server binds `HK_HOST`:`HK_PORT`. The simulator binds `127.0.0.1:5173` with a strict port.

## Request path

1. The planner in `apps/simulator/src/planner.ts` reads the utterance and chooses the next tool call. Hazard phrases stop before any tool call.
2. The MCP client sends one JSON-RPC message to `http://127.0.0.1:8787/mcp`.
3. The server checks Origin, `Content-Type`, `Accept`, and the session header, then runs the tool.
4. The tool calls `packages/core`. The repository reads and writes SQLite.
5. The tool result is a short `content` text plus `structuredContent`. A domain failure is the same shape with `isError: true`.
6. The host shows the text. For a visual tool it loads the linked `ui://` card into one sandboxed iframe and posts the tool result into that frame. A tap comes back as an utterance, and the planner sends the next tool call.

Sessions live in the server process. A restart drops them. The household rows stay in the SQLite file, so the next session still sees orders, tasks, and appliances.

## Components

| Component | Responsibility |
|---|---|
| `apps/mcp-server` | Streamable HTTP endpoint, in-memory sessions, header and Origin checks, ten tools, five card resources, `/healthz`, `/sim/*` |
| `packages/core` | Status buckets, compatibility, part policy, stock, quotes, orders, bookings, tasks, and audit, behind a repository interface |
| `apps/simulator` | Device frame, conversation, planner, MCP client, card host, trace, data drawer |
| SQLite | File from `HK_DB` (default `./data/hearthkeep.db`). An empty file loads seed v1 from `data/seed/`. |
| Mock payment | `confirm_purchase` checks `HK_PURCHASE_CODE` inside the server. The default demo code is `2468`. |
| `skills/home-upkeep` | Placeholder file. The running host does not load it. |

No AWS client is in the default install. With `HK_LLM_BASE_URL`, `HK_LLM_API_KEY`, and `HK_LLM_MODEL` unset or set, the planner stays the deterministic one in the simulator. The server does not read `HK_AUTH_TOKEN`.

## Tools

`tools/list` returns these ten tools, in this order:

| Tool | Card |
|---|---|
| `get_upkeep_status` | `ui://hearthkeep/status-card.html` |
| `resolve_appliance` | — |
| `register_appliance` | — |
| `find_parts` | `ui://hearthkeep/options-carousel.html` |
| `diagnose_symptom` | — |
| `find_service_slots` | `ui://hearthkeep/options-carousel.html` |
| `prepare_checkout` | `ui://hearthkeep/checkout-card.html` |
| `confirm_purchase` | `ui://hearthkeep/receipt-card.html` |
| `create_task` | `ui://hearthkeep/task-card.html` |
| `log_maintenance` | `ui://hearthkeep/task-card.html` |

A visual tool carries `_meta.ui.resourceUri`. `resources/list` and `resources/read` serve the HTML. The MIME type is `text/html;profile=mcp-app`. Card markup is inline. Buttons post intents. They do not call tools.

`set_preferences`, `get_home_profile`, and `cancel_order` are not registered. `tools/call` for an unknown name returns JSON-RPC `-32602`.

## Simulation routes

These routes are separate from `/mcp`. With `HK_SIM_MODE=0` every `/sim/*` path returns 404. In sim mode they use the same Origin allowlist as `/mcp`.

| Route | Result |
|---|---|
| `GET /healthz` | Always `200`. Body: `status`, `protocolVersion`, `storage`, `payment`, `simMode`, `simNow`. |
| `GET /sim/state` | `200` snapshot of the clock, appliances, schedule, inventory, orders, bookings, tasks, and audit. The data drawer reads this. |
| `POST /sim/clock` | `{advanceDays: 1-400}` or `{set: ISO time later than now}` returns `200 {now}`. Anything else is `400`. Next morning uses this. |
| `POST /sim/reset` | `200 {now, seed: "v1"}`. The database is reseeded and id counters restart. |

## Host controls

The header shows the first eight characters of the session id, the protocol label, the sim clock, and the badge `Deterministic (offline)`. New session keeps the database and opens a new MCP session. Reset demo calls `POST /sim/reset`. Trace lists the tool calls and redacts purchase codes. Data is read-only. Cards can be hidden. Voice, when on, speaks the latest reply with the browser `speechSynthesis` API on this computer. It does not call DashScope. About states the planner, storage, payment, catalog, endpoint, and protocol.

When the host cannot open a session it shows the banner `Can't reach the home server` and a Retry button. Retry builds a new client and calls `initialize` again. The transcript already on screen stays.
