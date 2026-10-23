# Devpost draft

Field names follow the product plan. Confirm them on the form before submitting. Household names, prices, brands, and the demo purchase code are fictional sample data.

## Project name

Hearthkeep

## Tagline

The Alexa+ agent that remembers your home: it tracks filters, batteries and vents, buys the exact part only with your code, and books the pro.

## Track

Alexa+ (simulated Alexa+ experience web app + self-hosted MCP server, spec 2025-11-25, Streamable HTTP)

## Built with

typescript, node.js 20, express 4.22.3, zod 4.6.7, streamable-http, sqlite, better-sqlite3 12.9.0, react 18.3.1, vite 7.3.7, playwright 1.64.1, vitest 4.1.12, github-actions

The MCP server is local code in `apps/mcp-server`. `@modelcontextprotocol/sdk` is not a dependency. Card UI resources are local HTML templates.

## Try it out

Public GitHub repository, MIT: https://github.com/HONGKONGBALL/hearthkeep. From a clone:

```bash
npm ci
npm run demo
```

Open http://127.0.0.1:5173. No API key is required.

## Video

Public YouTube or Vimeo link, under 3:00, added when the file is uploaded. The file in this repo is `docs/demo/hearthkeep-demo.mp4`. That path is not a public link.

## Gallery

Current simulator frames in this repo. Household data on screen is fictional. These paths are local files, not a Devpost upload.

v4 captures:

- `docs/screens/v4/01-welcome.png`
- `docs/screens/v4/02-briefing.png`
- `docs/screens/v4/03-parts.png`
- `docs/screens/v4/04-checkout.png`
- `docs/screens/v4/05-booking.png`

rc4 running UI:

- `docs/screens/rc4/a1-1280-next-morning.png` — F5 status card (C1) at 1280
- `docs/screens/rc4/a1-390-next-morning.png` — same card at 390
- `docs/screens/rc4/a1-768-next-morning.png` — same card at 768
- `docs/screens/rc4/v1-390-f5.png` and `docs/screens/rc4/v1-768-f5.png` — F5 viewport at 390 and 768
- `docs/screens/rc4/a5-1280-task-open.png` and `docs/screens/rc4/a5-1280-task-done.png` — task card (C5), open and completed
- `docs/screens/rc4/a5-390-task-open.png` and `docs/screens/rc4/a5-390-task-done.png` — C5 at 390
- `docs/screens/rc4/a5-768-task-open.png` and `docs/screens/rc4/a5-768-task-done.png` — C5 at 768
- `docs/screens/rc4/a2-1280-hazard-turn.png` and `docs/screens/rc4/a2-1280-next-turn.png` — gas alert, then the next turn
- `docs/screens/rc4/a2-390-hazard-turn.png` and `docs/screens/rc4/a2-390-next-turn.png` — same pair at 390
- `docs/screens/rc4/a2-768-hazard-turn.png` and `docs/screens/rc4/a2-768-next-turn.png` — same pair at 768
- `docs/screens/rc4/v1-390-f1.png` and `docs/screens/rc4/v1-768-f1.png` — morning briefing at 390 and 768

The architecture diagram is the second shot of the demo video: browser simulator, MCP server on Streamable HTTP, domain rules, SQLite. There is no separate concept-art cover.

## Simulation disclosure

Hearthkeep uses the simulated Alexa+ experience path. The web app simulates an Alexa+ household assistant and does not connect to Alexa+. The MCP server is real, implements MCP 2025-11-25 over Streamable HTTP, and handles every household lookup and action at runtime. All data is fictional.

## What it does

Hearthkeep is a local home-upkeep assistant for a fictional household. On a fresh clock, Wednesday 2026-10-21 09:00, it opens with a morning briefing from stored memory: the dryer vent cleaning is overdue and the fridge water filter is due. The status card lists that work.

Asked for a fridge filter, the server returns the fictional catalog rows that fit, marks the recommended exact-fit part, and leaves out a part the policy treats as uncertified. Choosing that part prepares a checkout. The purchase is mock. It is stored only after the demo purchase code. A wrong code does not create a receipt. The trace shows the tool calls and redacts the code.

A chirping hallway smoke alarm is diagnosed as a low battery. If a 9-volt battery is already on the shelf, the assistant uses that inventory instead of buying one, and a logged swap moves the next due date.

Booking a dryer-vent cleaning shows upcoming fictional slots. A slot over the spending cap is not saved until the caller approves the overage and confirms with the demo code. The cap check runs on the server.

Next morning is a new session on a clock one day later. The same database still has the order and the booking. Registering a fictional water heater is still there in a later session. A gas smell returns the safety line and does not start a shopping or booking tool.

## How we built it

The repo is an npm workspace.

- `packages/core` holds the domain rules and the SQLite repository (`better-sqlite3`). Seed v1 is fictional JSON under `data/seed/`.
- `apps/mcp-server` is Express. `POST /mcp` speaks MCP 2025-11-25 Streamable HTTP. The default response is one SSE message. `HK_JSON_RESPONSE=1` switches that response to JSON. Sessions, origin checks, and the ten P0 tools live here. `GET /healthz` and the sim routes (`/sim/reset`, `/sim/clock`, `/sim/state`) are separate from the MCP endpoint.
- `apps/simulator` is a Vite + React page on `127.0.0.1:5173`. It is the simulated host: device frame, welcome disclosure, quick chips, deterministic planner, card iframes, trace, and data drawer. With `HK_LLM_*` unset, no model is called.

Payment is the mock checker in the core package. Nothing in the default demo calls Amazon, Alexa, a retailer, or AWS.

Tests are Vitest for the protocol and domain, and Playwright in Chrome for the simulator flows. GitHub Actions config is `.github/workflows/ci.yml`. A remote Actions run was not executed here; this clone has no git remote (`BUILD.txt` item 2).

## Challenges, accomplishments, what we learned

From `docs/friction-log.md` and the chunk notes:

The 3.x Vitest lock pulled advisory-affected `tinypool` and `@vitest/mocker` packages. Health tests passed after pinning Vitest 4.1.12 (FL-02).

A demo server left on port 8787 failed one health case until that process was stopped (FL-01). The Chrome runner could not append to sticky `/tmp` logs for the acceptance user, so logs moved under `tests/e2e/.logs` (FL-04).

`initialize` had to advertise the five card resources, and the sim clock had to advance a shipment, before those checks matched the QA cases (FL-03). Sessions are in memory and do not survive a process restart.

FL-05 recorded that the README and the two early docs lagged the shipped server and simulator. At that time the local key file was not on this machine, so the Cherry track could not be synthesized (FL-06). The script now reads `DASHSCOPE_API_KEY` from the environment first and falls back to a local secrets file only when the variable is unset.

What shipped and was checked in `BUILD.txt`: a local MCP 2025-11-25 server, ten tools, five cards, the deterministic host, SQLite seed v1, and passing Vitest and Chrome suites, with fictional data labelled on the device.

## What's next

Attach this server to a real MCP host such as Alexa+ when access allows. Add real catalog, booking, and payment adapters behind the current interfaces. Mark parts delivered from Ring package events. Add a multi-home mode for landlords and caregivers.

## Testing instructions

Clone the repository. `npm ci`. `npm run demo`. Open http://127.0.0.1:5173. Click Start, then use the quick replies in order. `npm test` and `npm run test:e2e`. No keys are required for those commands. The video command is separate and reads the DashScope file only when you run `npm run demo:video`.

## Product feedback

`docs/product-feedback.md`

## Friction log

`docs/friction-log.md`

## Feature requests

`docs/feature-requests.md`

## Mini challenges

AWS Builder is not entered. The open-source mini challenge depends on a public GitHub repository. This clone has no remote yet. The license file is MIT, copyright 2026 Psyche.
