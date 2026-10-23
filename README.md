# Hearthkeep

Hearthkeep is a local home-upkeep assistant: an MCP server plus a browser simulation of an Alexa+ style host. You talk through upkeep reminders, a fictional parts catalog, and a mock checkout. The default run stays on this computer. It does not call Amazon, Alexa, or a real payment, catalog, or booking provider.

## Simulation disclosure

This project is a simulation. Appliances, households, prices, brands, and appointments are fictional. Payment is a mock that accepts only the demo purchase code. The simulator is not the Alexa app and it does not control devices in a house. The simulator frame and every card show a "Fictional data" label. The ribbon reads `SIMULATION — not a real Alexa+ device`.

## Prerequisites

- Node.js 20 LTS or newer
- npm 10 or newer (this repo is an npm workspaces monorepo)
- A Chromium-based browser for the simulator page
- Chrome for `npm run test:e2e` (Playwright uses the `chrome` channel)

No API key is required to install, run, or run `npm test`.

## Install

From a fresh clone, with no `.env` file:

```bash
npm ci
```

`npm run demo` reads `.env` when that file exists. Otherwise it reads `.env.example`, which contains only demo-safe values. `.env` is git-ignored.

## Run

```bash
npm run demo
```

That starts both processes and leaves them in the foreground until you stop them (Ctrl+C):

| Process | Address |
|---|---|
| MCP server | http://127.0.0.1:8787 |
| Simulator | http://127.0.0.1:5173 |

Open http://127.0.0.1:5173. The first screen is the welcome overlay. Choose Start.

Health check:

```bash
curl -sS http://127.0.0.1:8787/healthz
```

With the demo defaults the body is JSON with `status` `ok`, `protocolVersion` `2025-11-25`, `storage` `sqlite`, `payment` `mock`, `simMode` `true`, and `simNow` `2026-10-21T09:00:00-07:00`.

The server log line is `Hearthkeep MCP server listening on http://127.0.0.1:8787/mcp`.

## Test

```bash
npm test
```

Vitest covers the health payload, the domain rules, the protocol cases, the cards, and the planner. `npm run typecheck` runs the strict TypeScript projects.

## E2E

Playwright opens the simulator in Chrome at 1280×800. The command starts the MCP server on `127.0.0.1:8787` and the simulator on `127.0.0.1:5173` with `HK_SIM_MODE=1` and the database file `data/e2e.db`.

```bash
npm run test:e2e
```

Chrome has to be installed. The suite uses Playwright's `chrome` channel. It walks the simulator flows, including the quick chips, the cards, and the offline banner.

## Env table

`npm run demo` fills a documented default when a variable is missing from both the environment and the env file. A value already present in the environment wins over the file.

| Env var | Default | Status | Purpose |
|---|---|---|---|
| `HK_HOST`, `HK_PORT` | `127.0.0.1`, `8787` | Implemented | Bind address and port. The server listens on localhost. |
| `HK_DB` | `./data/hearthkeep.db` (git-ignored) | Implemented | SQLite file. Tests can use `:memory:`. |
| `HK_ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Implemented | Origin allowlist for the browser host. |
| `HK_SIM_MODE` | `1` in `npm run demo` | Implemented | `1` enables `/sim/*` and the clock controls. `0` turns simulation mode off. An unset value is on. |
| `HK_SIM_START` | `2026-10-21T09:00:00-07:00` | Implemented | Seed clock. Passed through as a timestamp string, offset included. |
| `HK_PURCHASE_CODE` | `2468` in `.env.example` (demo only) | Implemented | Mock payment confirmation code. An unset value uses `2468`. |
| `HK_JSON_RESPONSE` | `0` | Implemented | `1` switches MCP POST responses from one SSE `message` event to `application/json`. |
| `HK_AUTH_TOKEN` | unset | Not implemented | Listed for a future static bearer token. The server does not read this variable. Localhost has no auth. |
| `HK_LLM_BASE_URL`, `HK_LLM_API_KEY`, `HK_LLM_MODEL` | unset | Not implemented | Listed for a future planner model. The host always uses the deterministic offline planner. Setting these variables does not call a model. |
| `DASHSCOPE_API_KEY` | unset | Video script only | Set the environment variable `DASHSCOPE_API_KEY` before running `scripts/narrate-demo.mjs`. Never needed to run or test the product. |

## Demo script

Household names, prices, brands, and the purchase code in this script are fictional sample data. The two code chips send the demo code. The transcript and the trace show `••••` in place of the digits.

1. Run `npm ci`, then `npm run demo`.
2. Open http://127.0.0.1:5173 and choose Start. The clock reads Wednesday, October 21, 2026, 9:00 AM. The badge reads `Deterministic (offline)`.
3. Press the quick chips from left to right, in the order below. Wait until the assistant finishes each reply before you press the next chip.

| Order | Chip | What you should see |
|---|---|---|
| 1 | What needs doing? | Morning briefing. The dryer vent cleaning is overdue and the fridge water filter is due today. Status card. |
| 2 | Order a new filter for the fridge | Two filters that fit the fridge. The certified Rillstone CX-28 is the one to choose. Options card. |
| 3 | Yes, the CX-28 | Checkout for $24.99, arriving Friday, October 23, within the $60 limit. The assistant asks for the purchase code. |
| 4 | Say purchase code (demo) | Receipt. The order is placed. The code is masked. |
| 5 | The hallway smoke alarm keeps chirping | Low battery. Two 9-volt batteries are already on the garage shelf, so nothing is purchased. Task card. |
| 6 | Done, I swapped it | One battery left. The next battery change moves out by a year. |
| 7 | Book someone to clean the dryer vent next week | Three openings. The earliest is Tuesday morning with Ventora Home Care. Options card. |
| 8 | Tuesday morning | Checkout over the $60 limit. The assistant asks you to approve and give the code. |
| 9 | Approve with code (demo) | Booking receipt for Tuesday, October 27, 9 to 11 AM. |
| 10 | I just installed a new water heater, a Brimwell WH-40, in the garage | The water heater is registered. A flush reminder is set for October 2027. |
| 11 | When is the water heater due? | The flush is due in October 2027. |
| 12 | I smell gas in the kitchen | Safety alert. Leave and call for help from outside. No shopping or booking tool runs. |

Trace shows each tool call with the code redacted. Data shows the fictional household tables and is read-only. Reset demo reseeds the clock and the database. Next morning advances the clock one day and opens a new session. New session keeps the database and opens a new MCP session.

## Data notice

All sample households, appliances, prices, brands, and appointments in this repository are fictional and were invented for the demo. They are not real customers, orders, or offers. See [docs/data-notice.md](docs/data-notice.md). Seed files live in `data/seed/` and each one opens with a fictional-data notice.

## Architecture

See [docs/architecture.md](docs/architecture.md). Protocol check notes are in [docs/spec-notes.md](docs/spec-notes.md).

- `apps/mcp-server` — Streamable HTTP on `127.0.0.1:8787`, ten tools, five card resources, `GET /healthz`, and `/sim/*`
- `packages/core` — domain rules and the SQLite repository
- `apps/simulator` — Vite + React host on `127.0.0.1:5173`

## Troubleshooting

**Ports.** The MCP server binds `HK_HOST`:`HK_PORT` (default `127.0.0.1:8787`). The simulator binds `127.0.0.1:5173`. If either port is taken, stop the other process and run `npm run demo` again. The simulator uses a strict port and exits when 5173 is busy.

**Origin.** Open the simulator at `http://127.0.0.1:5173` or `http://localhost:5173`. Those two origins are the default `HK_ALLOWED_ORIGINS`. A page served from another origin receives HTTP 403 on `/mcp` and on `/sim/*`.

**Reset.** In the simulator, Reset demo calls `POST /sim/reset`. The response is `{ now, seed: "v1" }` and the clock returns to `HK_SIM_START` (default Wednesday 2026-10-21 09:00, offset `-07:00`). Removing the git-ignored file `data/hearthkeep.db` drops the local SQLite file. The next start loads seed v1. With `HK_SIM_MODE=0`, every `/sim/*` path returns 404.

**No `.env`.** That is a supported start. `npm run demo` loads `.env.example` when `.env` is absent.

**Health check is not ok.** `curl -sS -D- http://127.0.0.1:8787/healthz` should return HTTP 200 and JSON. If the connection is refused, the server process is not up or `HK_HOST` / `HK_PORT` point somewhere else.

**Can't reach the home server.** The simulator shows that sentence in a banner, with a Retry button, when it cannot open a session. Start `npm run demo` if it is not running, confirm `curl -sS http://127.0.0.1:8787/healthz` returns 200, then press Retry. Retry opens a new session and keeps the transcript already on screen. The same banner appears if you stop the server in the middle of a turn.

## License

MIT. Copyright (c) 2026 Psyche. See [LICENSE](LICENSE).
