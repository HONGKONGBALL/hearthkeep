# Hearthkeep

Hearthkeep is a local home-upkeep assistant: an MCP server plus a browser simulation of an Alexa+ style host. You talk through upkeep reminders, a fictional parts catalog, and a mock checkout. Nothing here calls Amazon, Alexa, or a real payment, catalog, or booking provider.

## Simulation disclosure

This project is a simulation. Appliances, households, prices, brands, and appointments are fictional. Payment is a mock that accepts only the demo purchase code. The simulator is not the Alexa app and it does not control devices in a house. A "Fictional data" label belongs on the simulator and on every card (the host UI arrives in a later chunk).

## Prerequisites

- Node.js 20 LTS or newer
- npm 10 or newer (this repo is an npm workspaces monorepo)
- A Chromium-based browser for the simulator page
- Chrome plus Playwright for end-to-end tests, when that suite is added

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

Health check:

```bash
curl -sS http://127.0.0.1:8787/healthz
```

With the demo defaults the body is JSON with `status` `ok`, `protocolVersion` `2025-11-25`, `storage` `sqlite`, `payment` `mock`, `simMode` `true`, and `simNow` `2026-10-21T09:00:00-07:00`.

## Test

```bash
npm test
```

Vitest calls `GET /healthz` on a temporary server and checks the zero-key payload. `npm run typecheck` runs the strict TypeScript projects.

## E2E

Playwright opens the simulator in Chrome at 1280×800 and runs QA sections F and G (cards and flows F1 to F8). The command starts the MCP server on `127.0.0.1:8787` and the simulator on `127.0.0.1:5173` with `HK_SIM_MODE=1` and a temporary database.

```bash
npm run test:e2e
```

Chrome has to be installed. The suite uses Playwright's `chrome` channel.

## Env table

| Env var | Default | Purpose |
|---|---|---|
| `HK_HOST`, `HK_PORT` | `127.0.0.1`, `8787` | Bind address and port. The server listens on localhost. |
| `HK_DB` | `./data/hearthkeep.db` (git-ignored) | SQLite file. Tests can use `:memory:`. |
| `HK_ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Origin allowlist for the browser host. |
| `HK_SIM_MODE` | `1` in `npm run demo` | Enables simulation clock controls. `0` turns simulation mode off. |
| `HK_SIM_START` | `2026-10-21T09:00:00-07:00` | Seed clock. Passed through as a timestamp string. |
| `HK_PURCHASE_CODE` | `2468` in `.env.example` (demo only) | Mock payment confirmation code. |
| `HK_JSON_RESPONSE` | `0` | `1` switches MCP POST responses to JSON (transport arrives later). |
| `HK_AUTH_TOKEN` | unset | Optional static bearer token. Not required on localhost. |
| `HK_LLM_BASE_URL`, `HK_LLM_API_KEY`, `HK_LLM_MODEL` | unset | Optional planner model. Unset means the deterministic planner. |
| `DASHSCOPE_API_KEY` | unset | Video narration only. Never needed to run the product. |

`npm run demo` sets the documented defaults when a variable is missing from both the environment and the env file. Values already present in the environment win over the file.

## Demo script

The ordered quick-chip script is filled in with the simulator conversation. The skeleton serves the host page and the health endpoint so that script can be wired without changing how the processes start.

## Data notice

All sample households, appliances, prices, brands, and appointments in this repository are fictional and were invented for the demo. They are not real customers, orders, or offers. See [docs/data-notice.md](docs/data-notice.md). Seed files live in `data/seed/` and each one opens with a fictional-data notice.

## Architecture

See [docs/architecture.md](docs/architecture.md).

- `apps/mcp-server` — HTTP transport on `127.0.0.1:8787`, including `GET /healthz`
- `packages/core` — domain rules behind a repository interface (health payload in this skeleton)
- `apps/simulator` — Vite + React host on `127.0.0.1:5173`

## Troubleshooting

**Ports.** The MCP server binds `HK_HOST`:`HK_PORT` (default `127.0.0.1:8787`). The simulator binds `127.0.0.1:5173`. If either port is taken, stop the other process and run `npm run demo` again. The simulator uses a strict port and exits when 5173 is busy.

**Origin.** The browser host is meant to be opened at `http://127.0.0.1:5173` or `http://localhost:5173`. Those two origins are the default `HK_ALLOWED_ORIGINS`. A page served from another origin is outside the allowlist.

**Reset.** Simulation state is reset from a fresh clock at `HK_SIM_START` (default Wednesday 2026-10-21 09:00, offset `-07:00`). Removing the git-ignored file `data/hearthkeep.db` drops the local SQLite file. The reset endpoint itself arrives with the simulation routes.

**No `.env`.** That is a supported start. `npm run demo` loads `.env.example` when `.env` is absent.

**Health check is not ok.** `curl -sS -D- http://127.0.0.1:8787/healthz` should return HTTP 200 and JSON. If the connection is refused, the server process is not up or `HK_HOST` / `HK_PORT` point somewhere else.

## License

MIT. Copyright (c) 2026 Zhenhua Liu. See [LICENSE](LICENSE).
