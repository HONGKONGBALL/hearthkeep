# Hearthkeep

An Alexa+ style home-upkeep agent that tracks filters, batteries, and vents, buys the matching part only after you give your purchase code, and books a service visit.

All households, appliances, prices, brands, appointments, and the demo purchase code are fictional sample data.

## Track

Alexa+ (simulated Alexa+ experience). The demo runs on our own browser page that simulates an Alexa+ device. It does not connect to Alexa+. The MCP server behind it is real, and every action in the demo is a tool call on it. Orders and bookings are mock; nothing calls Amazon, a retailer, or a payment service.

## Inspiration

Home upkeep is a list of small dates nobody remembers: the fridge water filter, the smoke alarm battery, the dryer vent, the water heater flush. Each one needs the right part or the right pro, and a voice assistant that only answers single questions forgets the house between conversations. Hearthkeep keeps the household's appliances and schedule in one place, notices what is due, and carries a task through to an order or a booking, with spending under the owner's control.

## What it does

Hearthkeep runs as two local processes: an MCP server and a browser page that simulates an Alexa+ device. In the simulator you can:

- Ask "What needs doing?" and get a morning briefing with a status card showing overdue and due-today items.
- Order a part. Hearthkeep lists parts that fit the registered appliance, recommends the certified one (the policy filter), prepares a checkout, and places the mock order only after the purchase code is given. The code is masked in the transcript and trace.
- Report a symptom such as a chirping smoke alarm. Hearthkeep diagnoses a low battery, checks household stock first, and creates a swap task when a spare is already on the shelf. Logging the swap updates stock and moves the next due date.
- Book a service visit. Hearthkeep shows available slots on an options card. A checkout above the household spending limit ($60 in the demo) requires an explicit approval plus the code.
- Register a new appliance by voice and get its maintenance reminder scheduled.
- Say a hazard phrase such as "I smell gas". Hearthkeep gives safety instructions and stops before any shopping or booking tool runs.

State persists in SQLite across sessions, so a new session still sees earlier orders, tasks, and appliances. A sim clock can advance a day ("Next morning") to show shipments and due dates moving. The host shows a tool-call trace, a read-only data drawer, and a "Fictional data" label on every card.

## How we built it

The repo is an npm workspaces monorepo in TypeScript on Node.js 20.

- `packages/core` holds the domain rules (status buckets, part compatibility, stock, quotes, spending cap, orders, bookings, tasks, audit log) behind a repository interface, implemented with SQLite through `better-sqlite3`. An empty database loads a fictional seed from `data/seed/`.
- `apps/mcp-server` is an Express server whose `POST /mcp` endpoint speaks MCP 2025-11-25 over Streamable HTTP with POST request/response only (no standalone GET stream; `GET /mcp` returns 405), with in-memory sessions, Origin and header checks, and input validation with Zod. It registers ten tools and serves five `ui://` card resources as MCP App HTML (`text/html;profile=mcp-app`). `GET /healthz` and `/sim/*` clock and reset routes sit beside the MCP endpoint.
- `apps/simulator` is a Vite + React page that acts as the host: device frame, quick chips, a deterministic offline planner that maps utterances to tool calls, sandboxed card iframes, trace, and data drawer. Optional voice output uses the browser `speechSynthesis` API.
- Payment is a mock checker in the core package (`confirmPurchase` in `packages/core/src/domain.ts`) that accepts only the demo purchase code; the server's `confirm_purchase` tool calls it.

Tests use Vitest for the protocol, domain, cards, and planner, and Playwright in Chrome (with axe-core accessibility checks) for the simulator flows. A GitHub Actions workflow is configured to run both suites. The demo video is recorded with Playwright, narrated with Alibaba Cloud DashScope TTS (qwen3-tts-flash), and assembled with FFmpeg. The product itself calls no AI service.

## Challenges we ran into

The protocol and QA checks took several passes to agree: the session trace had to show the `notifications/initialized` handshake, and the sim clock had to advance a shipment. Dependency advisories in the Vitest 3.x lock tree led us to pin Vitest 4.1.12. Test infrastructure also needed work: a leftover demo server on port 8787 broke a health test, and the Chrome runner could not write to shared `/tmp` logs, so logs moved under `tests/e2e/.logs`. We also re-synced the README and docs with the shipped server several times; `docs/friction-log.md` tracks these entries.

## Accomplishments that we're proud of

An MCP 2025-11-25 server over Streamable HTTP (POST request/response, no standalone GET stream), written without an SDK, with ten tools and five interactive cards, driven end to end by a twelve-step demo conversation. Spending stays under the owner's control: every purchase needs the code, and anything over the limit also needs an explicit approval. Safety phrases stop before any shopping or booking tool runs. The whole demo runs offline with no API keys, and on the tested commit (`e523db1`) 231 Vitest tests and 41 Playwright tests in Chrome pass. The utterance-to-reply p95 is 33.1 ms over 30 samples.

## What we learned

Writing the protocol layer by hand taught us the details: session headers, Origin checks, SSE versus JSON responses, and how tool results link to UI resources. Putting the business rules in a core package behind a repository interface made them easy to test without the server. A deterministic planner made the demo and the end-to-end tests repeatable.

## What's next for Hearthkeep

Connect the server to a real MCP host such as Alexa+ when access allows, add real catalog, booking, and payment adapters behind the existing interfaces, and add a multi-home mode for landlords and caregivers.

## Built with

typescript, node.js, express, zod, model-context-protocol, sqlite, better-sqlite3, react, vite, vitest, playwright, axe-core, github-actions, dashscope, ffmpeg

## GitHub repo

https://github.com/HONGKONGBALL/hearthkeep (public, MIT license, copyright 2026 Psyche)

## Testing instructions

Requires Node.js 20+, npm 10+, and Chrome. No API key or account is needed.

1. `git clone https://github.com/HONGKONGBALL/hearthkeep && cd hearthkeep && npm ci`
2. `npm run demo` starts the MCP server on http://127.0.0.1:8787 and the simulator on http://127.0.0.1:5173.
3. Open http://127.0.0.1:5173, choose Start, and press the quick chips from left to right. The demo purchase code is `2468` (fictional, mock payment only).
4. `npm test` runs the Vitest suites. `npm run test:e2e` runs the Playwright suites in Chrome.

## Related docs

- `docs/product-feedback.md`
- `docs/friction-log.md`
- `docs/feature-requests.md`
- `docs/architecture.md`
