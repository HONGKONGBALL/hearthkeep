# Hearthkeep — Product Requirements (PRD)

Version 1.0 · 2026-10-20 · Owner: Psyche (solo) · Track: Alexa+ · MIT License, Copyright 2026 Psyche

Inputs: brief.md only. Items marked **[verify D0]** are MCP wire details to confirm against the 2025-11-25 spec and the MCP Apps text on Day 0 and record in `docs/spec-notes.md`. If the text differs, the spec wins and this PRD and qa.md are updated the same day.

## 1. Summary

Hearthkeep is an Alexa+ household agent that remembers every appliance in the home, knows what each one needs and when, buys exactly the right part under household rules, books a pro when the job is not DIY, and stops everything for safety advice when something sounds dangerous. It ships as two parts:

1. **Hearthkeep MCP server**: self-hosted, MCP spec 2025-11-25 over Streamable HTTP; durable home memory, workflows, guardrails and MCP Apps card resources.
2. **Alexa+ simulation host**: a web app that simulates the Alexa+ experience on a smart-display-style frame (conversation, agent planner, MCP client, card renderer, trace panel), labelled SIMULATION everywhere.

## 2. Schedule (work started 2026-10-20 16:00 Asia/Shanghai)

| Milestone | Asia/Shanghai | Pacific |
|---|---|---|
| Day-0 spike decisions: SDK speaks 2025-11-25, MCP Apps bridge, TTS test, Playwright video capture | Tue 10-20 22:00 | Tue 10-20 07:00 |
| Server, 10 tools, protocol tests green (qa.md B to E) | Thu 10-22 00:00 | Wed 10-21 09:00 |
| Simulator, planner, flows F1 to F8 green (qa.md F, G) | Fri 10-23 00:00 | Thu 10-22 09:00 |
| Feature freeze; P1 cut if unfinished | Fri 10-23 12:00 | Thu 10-22 21:00 |
| Video final and uploaded | Fri 10-23 18:00 | Fri 10-23 03:00 |
| Devpost submitted (internal target) | Sat 10-24 00:00 | Fri 10-23 09:00 |
| Hard deadline | Sat 10-24 03:00 | Fri 10-23 12:00 |

## 3. Goals and measures

| ID | Goal | Measure at submission |
|---|---|---|
| G1 | Qualify cleanly for the Alexa+ track | qa.md A and J pass |
| G2 | Score on all four criteria | Flows F1 to F8 and transport suite B pass |
| G3 | Earn the friction-log bonus | 6 to 10 real, reproducible entries |
| G4 | Zero-cost reproducibility | Fresh clone runs with no keys |

Pilot metrics for later (none claimed now): share of due items done within 7 days of due date; purchases completed without manual search; wrong-part purchases; time from "it's beeping" to resolution.

## 4. Users

| Persona (fictional) | Context | Needs |
|---|---|---|
| Sam, household lead | A home with appliances of mixed ages; smart display in the kitchen | Hear what is due, buy the right part fast, never be surprised by a purchase |
| Judge or developer | Runs the repo on a laptop | One-command run, clear labels, visible MCP traffic, passing tests |
| Later: landlord, remote caregiver | Many units, or a relative's home | Same memory and workflows across several homes (out of scope now) |

## 5. Experience principles (voice first, screen second)

1. Speak the decision, show the details: replies of at most 2 sentences (about 35 words); specifics live on cards.
2. At most 3 options; recommend one and say why.
3. Before money moves, state item, total, arrival or time slot, and what to say next.
4. Every purchase needs the purchase code; over-limit purchases also need the word "approve".
5. Check stock before shopping.
6. Refer to remembered context by name ("your Ferngate FG-28").
7. Safety beats commerce: hazard words stop the flow before any tool call.
8. Clarify instead of guessing: an ambiguous appliance or alarm sound gets one short question, sound first.
9. Labels never disappear: SIMULATION ribbon, "Fictional data" chip, "Mock order, no real purchase".
10. Plain-language errors with a next step; cards are optional (text-only parity).

## 6. Architecture

    +---------------------- Browser (Chrome) ---------------------+
    | Alexa+ simulation host (Vite + React)              :5173    |
    |   conversation -> planner -> MCP client -> trace panel      |
    |   card host: sandboxed iframes for MCP Apps UI resources    |
    +-----------------------------+-------------------------------+
                                  | MCP 2025-11-25, Streamable HTTP
                                  | POST/DELETE /mcp  (+ /healthz, /sim/*)
    +-----------------------------v-------------------------------+
    | Hearthkeep MCP server (Node + TypeScript)   127.0.0.1:8787  |
    |   transport, sessions, Origin check, 10 tools,              |
    |   5 ui:// card resources, simulated clock                   |
    |   packages/core: memory, schedules, catalog, inventory,     |
    |   checkout guardrails, bookings, tasks, audit               |
    |   adapters: storage=SQLite catalog=seed payment=mock        |
    |             booking=seed planner=host-side; no AWS          |
    +-------------------------------------------------------------+

| Component | Responsibility |
|---|---|
| `apps/mcp-server` | Streamable HTTP endpoint, session map, header and Origin checks, tools and resources, `/healthz`, `/sim/*` |
| `packages/core` | Domain rules (status buckets, compatibility, policy, stock, quotes, orders, bookings, tasks, audit) behind a repository interface |
| `apps/simulator` | Device frame, conversation, planner, MCP client, card host, trace, data drawer |
| Adapters | storage (SQLite or in-memory), catalog and booking (fictional seed), payment (mock), planner (deterministic, or LLM via env in P1). AWS-backed variants could be added later; none is in the default install |
| `skills/home-upkeep` (P1) | Agent Skill: when to use, tool recipes, guardrails, voice style |

## 7. MCP surface

### 7.1 Transport contract [verify D0]

| Aspect | Behaviour |
|---|---|
| Endpoint | `http://127.0.0.1:8787/mcp` |
| POST | One JSON-RPC message per body. Requests: `200` with `text/event-stream` (one `message` event carrying the response, progress events first when requested), or `application/json` when `HK_JSON_RESPONSE=1`. Client notifications or responses: `202`, empty body. No event IDs or stream resumption in P0 |
| GET | `405` (no standalone server stream in P0) |
| DELETE | Ends the session, `200`; later use of that id gives `404` |
| Version | `initialize` negotiates `2025-11-25`; an unknown or older requested version is answered with `2025-11-25`. After init, `MCP-Protocol-Version` is checked: unsupported gives `400`; absent means the negotiated version |
| Session | `Mcp-Session-Id` (random UUID v4) issued on `initialize`; missing on any other request gives `400`; unknown or ended gives `404`. Sessions live in memory; home memory lives in SQLite, so a restart ends sessions but never loses data |
| Origin | Present and not in `HK_ALLOWED_ORIGINS`: `403` with a JSON-RPC error body, no session created. Absent (non-browser client): allowed |
| CORS | Allowlisted origins get CORS headers: preflight `OPTIONS` returns `204`; allowed methods POST, GET, DELETE; allowed headers Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version, Authorization; `Access-Control-Expose-Headers: Mcp-Session-Id`, without which the browser host cannot read its session id |
| Content | `Content-Type` not JSON: `415`. `Accept` lacking `application/json` or `text/event-stream`: `406`. Unparsable JSON: `400` with `-32700`. JSON array (batch): `400` with `-32600` |
| Errors | Protocol errors are JSON-RPC errors (unknown tool: `-32602`). Validation and business errors are tool results with `isError: true` and `structuredContent.error.code` (7.3), so the agent can recover; argument checks run inside the tool handler so they never surface as protocol errors. Every `outputSchema` also admits the shared `error` object, so error results still validate in clients that check them |
| Bind, auth | 127.0.0.1 by default, no auth on localhost. P1: static bearer token (`HK_AUTH_TOKEN`), missing or wrong gives `401` with `WWW-Authenticate: Bearer`. OAuth is out of scope |

### 7.2 Tools

Every tool returns a short speakable `content` text (at most 2 sentences) plus `structuredContent` matching its `outputSchema`. Visual tools point at a card template through MCP Apps tool metadata [verify D0]. Dates are household-local (America/Los_Angeles); money is USD with 2 decimals.

| Tool | P | Purpose | Key input | Key output | Card |
|---|---|---|---|---|---|
| `get_upkeep_status` | P0 | What needs attention, what is coming, what is in progress | `horizonDays` 1 to 400 (default 14), `applianceId?` | `now`, `attention[]` (overdue, due today; oldest first), `upcoming[]`, `inProgress[]` (orders, bookings), `tasks[]`. Items with an active order or booking appear only in `inProgress` | C1 |
| `resolve_appliance` | P0 | Map "the fridge", "hallway alarm" to an appliance | `query` | `status` match or ambiguous, `appliance` or `candidates[]`; nothing found gives `APPLIANCE_NOT_FOUND` | — |
| `register_appliance` | P0 | Learn an appliance and its schedule from the catalog | `type`, `maker`, `model`, `location`, `installedOn?` | `applianceId`, `created`, `scheduleSource` catalog or none, `schedule[]`. Idempotent on maker + model + location | — |
| `find_parts` | P0 | Parts that fit, filtered by policy, with stock | `applianceId`, `item` | `options[]` (price, ETA, kind, certified, recommended), `excluded[]` with reason, `onHand`, `recommendedAction` buy or use_on_hand; when stock on hand covers the need, no option is marked recommended | C2 |
| `diagnose_symptom` | P0 | Symptom to cause and item, or a hazard flag | `applianceId`, `symptom` | `hazard`, `cause?`, `item?`, `advice` | — |
| `find_service_slots` | P0 | Pro appointments for a service item | `applianceId`, `item`, `from`, `to` (future dates) | `slots[]` (provider, start, end, price, `overCap`) | C2 |
| `prepare_checkout` | P0 | Price a purchase; nothing is bought | `items[]` (1 to 3, all one type): `{type: "part", optionId, qty 1-10, forApplianceId}` or `{type: "service", slotId}` | `quoteId`, `lines[]`, `totalUsd`, `eta` or `slot`, `capUsd`, `overCap`, `overByUsd?`, `expiresAt` (15 sim-minutes) | C3 |
| `confirm_purchase` | P0 | Place the mock order or booking | `quoteId`, `code`, `approveOverCap?` | `kind`, id, `status`, `eta` or `slot`, `mock: true`, `alreadyConfirmed?`, `createdTaskId?`. Idempotent per quote | C4 |
| `create_task` | P0 | Add a household task | `title`, `applianceId?`, `item?`, `dueDate?`, `notes?` | `taskId`, task | C5 |
| `log_maintenance` | P0 | Record a job done, use stock, roll the schedule | `applianceId`, `item`, `doneOn?`, `consumeInventory?` (default true) | `lastDone`, `nextDue`, `inventoryAfter?`, `closedTaskIds[]` | C5 |
| `set_preferences` | P1 | Change cap or part policy | `spendCapUsd?`, `partPolicy?` | preferences | — |
| `get_home_profile` | P1 | Appliances, stock, preferences in one read | none | profile | — |
| `cancel_order` | P1 | Cancel before shipping | `orderId` | order; shipped gives `ORDER_NOT_CANCELLABLE` | C4 |

Annotations: the five lookup tools and `get_home_profile` are read-only; `confirm_purchase` is idempotent and open-world and keeps the default destructive hint because it spends money; `cancel_order` is destructive; the other writes set `destructiveHint: false`.

### 7.3 Domain error codes (tool results with `isError: true`)

| Code | Raised when | Example speech |
|---|---|---|
| `INVALID_ARGUMENT` | Schema or semantic check fails (type, qty range, window in the past, empty items) | "I need a date range in the future for that." |
| `APPLIANCE_NOT_FOUND` | No appliance matches | "I don't know a garage door yet. Want to add it?" |
| `ITEM_NOT_APPLICABLE` | Item is not on that appliance's schedule | "The dryer doesn't take a water filter." |
| `PART_NOT_COMPATIBLE` | Option does not fit `forApplianceId` | "That filter doesn't fit your furnace." |
| `POLICY_EXCLUDED` | Option fails household policy | "That one isn't certified, so your rules exclude it." |
| `SLOT_UNAVAILABLE` | Slot taken or past | "That time was just taken." |
| `QUOTE_NOT_FOUND`, `QUOTE_EXPIRED`, `QUOTE_LOCKED` | Unknown quote, past `expiresAt`, or 3 wrong codes | "That price expired. Want me to check again?" |
| `INVALID_PURCHASE_CODE` | Wrong code; `attemptsRemaining` returned | "That code didn't match. You have 2 tries left." |
| `OVER_CAP_APPROVAL_REQUIRED` | Over cap without `approveOverCap: true`; does not use up an attempt | "That's over your limit. Say 'approve' and your code." |
| `ORDER_NOT_CANCELLABLE` (P1) | Order already shipped | "It has already shipped." |

`confirm_purchase` checks run in this order: quote exists, not expired, not locked, code, over-cap approval. A wrong code always uses an attempt, even on an over-cap quote.

### 7.4 MCP Apps card resources [verify D0]

Five self-contained HTML templates listed by `resources/list` and served by `resources/read` under `ui://hearthkeep/`, with the MCP Apps HTML MIME type. Inline CSS and JS only, no network requests. Each renders the tool result delivered by the host bridge and sends user actions back to the host as **intents** (the same words the user could have said), never as direct tool calls, so a tap can never skip a confirmation.

### 7.5 Non-MCP endpoints

| Endpoint | Mode | Result |
|---|---|---|
| `GET /healthz` | always | `200` with `status ok`, `protocolVersion 2025-11-25`, `storage sqlite`, `payment mock`, `simMode`, `simNow` |
| `GET /sim/state` | sim only | `200` snapshot: clock, appliances, schedule, inventory, orders, bookings, tasks, audit |
| `POST /sim/clock` | sim only | `{advanceDays: 1-400}` or `{set: ISO time later than now}` gives `200 {now}`; anything else `400` |
| `POST /sim/reset` | sim only | `200 {now: 2026-10-21T09:00:00-07:00, seed: v1}`; state reseeded, ID counters reset |
| `/sim/*` outside sim mode | — | `404` |

`/sim/*` obeys the same Origin allowlist. In sim mode IDs are sequential after reset (`q_0001`, `ord_0001`, `bk_0001`, `t_0001`, new appliances `ap_0001`); session IDs stay random. The sim clock is stored in SQLite and moves only through `/sim/clock` (the Next morning button uses it), so time never drifts during a demo or a test. An empty database is loaded with seed v1 on first start.

## 8. Screens

### 8.1 Simulator

| ID | Screen | Content and behaviour |
|---|---|---|
| S0 | Welcome overlay | First run: what this is (simulated Alexa+ household agent, real MCP server), data notice, Start |
| S1 | Device frame and header | 1024x600 smart-display-style frame of our own design (no Amazon or Alexa logos, light ring or product imagery) in a 1280x800 viewport; ribbon "SIMULATION — not a real Alexa+ device"; chip "Fictional data"; large sim time and date; hint "Try: What needs doing?". Header outside the frame: session id (first 8 chars), protocol 2025-11-25, sim date and time, buttons New session, Next morning (+1 day and new session), Reset demo; toggles Trace, Data, Cards, Voice (P1); planner badge ("Deterministic (offline)" or the LLM model name). States: connecting, connected, server unreachable (banner "Can't reach the home server" + Retry) |
| S2 | Conversation | Last 6 turns in the frame; assistant "speaking" pulse; input "Type what you'd say..." (Enter sends, a leading "Alexa," is ignored); quick chips (9.6). A turn that is only a 4 to 8 digit code, or "approve" plus one, is a code turn: the input shows a lock while a code is awaited, and the digits always appear as •••• in the transcript and trace |
| S3 | Card stage | Right side of the frame (below the reply under 900 px); one sandboxed iframe per card (`allow-scripts` only, never same-origin) with a no-network Content-Security-Policy injected by the host; arrow keys move through carousel tiles; Cards off hides it and leaves text unchanged |
| S4 | Trace panel | Per turn: intent and slots; plan steps (done, failed, skipped); per MCP call: method, tool, args (codes redacted), HTTP status, ms, session prefix, protocol; guards fired (hazard, scope); raw JSON toggle |
| S5 | Data drawer | Tabs Appliances, Schedule, Inventory, Orders and bookings, Tasks, Audit; read-only from `/sim/state`; banner "All data is fictional sample data" |
| S6 | About | Adapters (planner, storage, payment mock, catalog fictional seed), endpoint, protocol, simulation disclosure, data notice, MIT, doc links |

### 8.2 Cards (MCP Apps UI resources)

| ID | Resource | Used by | Content | Actions (sent as intents) |
|---|---|---|---|---|
| C1 | `ui://hearthkeep/status-card.html` | `get_upkeep_status` | Needs attention, Coming up, On the way / Booked, Open tasks; rows show appliance, item and a date phrase ("21 days overdue", "due today", "Wed, Oct 28"); empty state "All caught up" | Handle it (for example "Order a new filter for the fridge") |
| C2 | `ui://hearthkeep/options-carousel.html` | `find_parts`, `find_service_slots` | Up to 3 tiles: name, fits or provider line, price, ETA or time window, badges (OEM, Compatible, Certified, Recommended, Over $60 limit); footer "Not shown" with reasons | Choose (for example "Choose Rillstone CX-28") |
| C3 | `ui://hearthkeep/checkout-card.html` | `prepare_checkout` | Lines, total, arrival or slot, limit status ("Within your $60 limit" or "Over your $60 limit by $29.00"), what to say ("Say your purchase code" or "Say 'approve' and your code"); no code field | Confirm by voice (host then asks for the code), Cancel |
| C4 | `ui://hearthkeep/receipt-card.html` | `confirm_purchase`, `cancel_order` | Order or booking id, lines, total, status steps (Placed, Shipped, Delivered or Booked), date, "Mock order, no real purchase or payment", next step | none |
| C5 | `ui://hearthkeep/task-card.html` | `create_task`, `log_maintenance` | Task, due date, appliance, supplies on hand with location ("9V battery x2, Garage shelf"), done state | Mark done ("Done, I swapped it") |

All cards: "Fictional data" chip, readable from about 2 m (body text 20 px or more), WCAG 2.1 AA contrast, keyboard operable, reduced motion respected, minimum width 320 px.

## 9. Sample data (all fictional, seed v1)

Every seed file starts with a fictional-data notice; `docs/data-notice.md` lists every invented name. No addresses, phone numbers, emails or payment details exist anywhere.

### 9.1 Household and preferences

Household "Demo Household (fictional)", member Sam (fictional), timezone America/Los_Angeles, USD. Sim clock starts **Wed 2026-10-21 09:00 -07:00**. Preferences: spend cap $60.00 per order; part policy `oem_or_certified` (uncertified water filters excluded); among allowed options pick the cheapest, then the earliest arrival; purchase code required (`HK_PURCHASE_CODE`, demo value 2468); "coming up" window 14 days; quote lifetime 15 sim-minutes; 3 code attempts per quote.

### 9.2 Appliances and schedules

| ID | Spoken name | Maker and model | Location | Item (how) | Every | Last done | Next due | State on 10-21 |
|---|---|---|---|---|---|---|---|---|
| `ap_fridge` | fridge | Ferngate FG-28 | Kitchen | `water_filter` (part) | 180 d | 2026-04-24 | 2026-10-21 | due today |
| `ap_furnace` | furnace | Calorith CF-90 (16x25x1, max MERV 11) | Hall closet | `air_filter` (part) | 90 d | 2026-08-01 | 2026-10-30 | coming up, 9 d |
| `ap_smoke_hall` | hallway smoke alarm | Wardlight SA-9 | Hallway | `battery` 9V (part) | 365 d | 2025-10-28 | 2026-10-28 | coming up, 7 d |
| `ap_smoke_bed` | bedroom smoke alarm | Wardlight SA-9 | Main bedroom | `battery` 9V (part) | 365 d | 2026-03-15 | 2027-03-15 | later |
| `ap_dryer` | dryer | Tumblewell TD-5 | Laundry | `vent_cleaning` (pro) | 365 d | 2025-09-30 | 2026-09-30 | 21 d overdue |
| `ap_porch` | porch light | generic fixture, A19 LED 2700K 800 lm | Front porch | `bulb` (part) | on failure | — | — | — |

Catalog-only model for registration: Brimwell WH-40 water heater, `flush` every 365 days. Any other model registers with no schedule.

### 9.3 Inventory

| Item | Qty | Location |
|---|---|---|
| 9V battery | 2 | Garage shelf |
| A19 LED bulb 2700K 800 lm | 1 | Kitchen drawer |

### 9.4 Parts catalog (prices and brands fictional; ETA from 10-21)

| Option | Fits | Name | Kind | Certified | Price | Arrives | Result |
|---|---|---|---|---|---|---|---|
| `P-CX28` | FG-28 water_filter | Rillstone CX-28 | compatible | yes | $24.99 | Fri 10-23 | recommended |
| `P-FGWF2` | FG-28 water_filter | Ferngate FG-WF2 | OEM | yes | $49.99 | Fri 10-23 | allowed |
| `P-ZX28` | FG-28 water_filter | Bargo ZX-28 | compatible | no | $12.99 | Sat 10-24 | excluded `POLICY_UNCERTIFIED` |
| `P-LF11` | CF-90 air_filter | Loftaire 16x25x1 MERV 11, 3-pack | compatible | n/a | $27.99 | Fri 10-23 | recommended |
| `P-CF11` | CF-90 air_filter | Calorith 16x25x1 MERV 11, 3-pack | OEM | n/a | $38.97 | Sat 10-24 | allowed |
| `P-LF13` | CF-90 air_filter | Loftaire 16x25x1 MERV 13, 3-pack | compatible | n/a | $34.99 | Fri 10-23 | excluded `EXCEEDS_MAKER_SPEC` |
| `P-VW9V` | SA-9 battery | Voltwick 9V, 4-pack | generic | n/a | $11.49 | Thu 10-22 | allowed |
| `P-GM19` | porch bulb | Glowmere A19 LED 2700K 800 lm, 4-pack | generic | n/a | $9.99 | Thu 10-22 | allowed |

Arrival dates assume an order placed on 10-21; the catalog stores lead times (1 to 3 days), so later orders shift accordingly. Orders ship the day after they are placed and arrive on the ETA date; arrival adds the part to stock as "Received, not yet installed".

### 9.5 Symptoms and service slots

| Appliance | Phrases | Result |
|---|---|---|
| Wardlight SA-9 | chirp, chirping, beeps once a minute | `low_battery`, item `battery` |
| Ferngate FG-28 | filter light, water tastes odd | `filter_due`, item `water_filter` |
| Tumblewell TD-5 | takes two cycles, clothes still damp | `vent_restricted`, item `vent_cleaning` |
| Porch light | light is out | `bulb_failed`, item `bulb` |
| Any (hazard) | smell gas, smell or see smoke, fire, sparks, burning smell, CO alarm, alarm going off, keeps sounding | `hazard: true`, safety advice only |

| Slot | Provider (fictional) | Window (household time) | Price |
|---|---|---|---|
| `S-1027A` | Ventora Home Care | Tue 2026-10-27 09:00-11:00 | $89.00 |
| `S-1028P` | Flueline Services | Wed 2026-10-28 13:00-15:00 | $109.00 |
| `S-1031A` | Ventora Home Care | Sat 2026-10-31 10:00-12:00 | $99.00 |

### 9.6 Quick chips (demo script order)

What needs doing? · Order a new filter for the fridge · Yes, the CX-28 · Say purchase code (demo) · The hallway smoke alarm keeps chirping · Done, I swapped it · Book someone to clean the dryer vent next week · Tuesday morning · Approve with code (demo) · I just installed a new water heater, a Brimwell WH-40, in the garage · When is the water heater due? · I smell gas in the kitchen

## 10. Flows (from reset; replies abbreviated)

| ID | Utterance | Plan (tool calls) | Reply and card | State change |
|---|---|---|---|---|
| F1 Briefing | session opens, or "What needs doing?" | `get_upkeep_status(14)` | "Good morning, the dryer vent cleaning is three weeks overdue and your fridge water filter is due today. Want me to handle them?" C1 | none |
| F2 Exact-fit reorder | "Order a new filter for the fridge" → "Yes, the CX-28" → code | `resolve_appliance` → `find_parts(ap_fridge, water_filter)` → `prepare_checkout(P-CX28 x1)` → `confirm_purchase(q_0001, code)` | "Two filters fit your Ferngate FG-28, and the certified Rillstone CX-28 is $24.99, arriving Friday. Want that one?" C2 → "That's $24.99, arriving Friday, October 23. Say your purchase code to confirm." C3 → "Ordered. I'll remind you to swap it on Friday." C4 | `ord_0001` placed; task `t_0001` "Install fridge water filter" due 10-23; fridge item moves to in progress |
| F3 Use what you own | "The hallway smoke alarm keeps chirping" → "Done, I swapped it" | hazard guard → `resolve_appliance` → `diagnose_symptom` → `find_parts(battery)` (on hand 2) → `create_task` → later `log_maintenance` | "That chirp usually means a low battery, and you have two 9-volt batteries on the garage shelf. Nothing to buy, so I added a task." C5 → "Nice. One 9-volt left, and the next battery change is due October 2027." | 9V stock 2 to 1; next due 2027-10-21; task closed |
| F4 Book a pro | "Book someone to clean the dryer vent next week" → "Tuesday morning" → code → "Approve" + code | `resolve_appliance` → `find_service_slots(ap_dryer, vent_cleaning, 10-26..11-01)` → `prepare_checkout(S-1027A)` → `confirm_purchase` (rejected `OVER_CAP_APPROVAL_REQUIRED`) → `confirm_purchase(approveOverCap)` | "I found three openings next week. The earliest is Tuesday, 9 to 11 AM, with Ventora Home Care for $89." C2 → "That's $89, which is $29 over your $60 limit. To book it anyway, say 'approve' and your code." C3 → "Booked for Tuesday, October 27, 9 to 11 AM. It's on your schedule." C4 | `bk_0001` booked; dryer item moves to in progress |
| F5 Next morning | press Next morning | clock +1 day; DELETE old session; `initialize` new session; `get_upkeep_status(14)` | "Good morning. Your fridge filter has shipped and arrives tomorrow, and the dryer vent cleaning is booked for Tuesday." C1 | none |
| F6 Learn and recall | "I just installed a new water heater, a Brimwell WH-40, in the garage" → (new session) "When is the water heater due?" | `register_appliance` → later `resolve_appliance` → `get_upkeep_status(400, applianceId)` | "Added your Brimwell WH-40 water heater in the garage. I'll remind you to flush it in October 2027." → "Your water heater is due for a flush in October 2027." | appliance `ap_0001`, schedule `flush` |
| F7 Safety | "I smell gas in the kitchen" | hazard guard only, zero tool calls | "If you smell gas, leave the home now and call your local emergency number or gas utility from outside. I can't help troubleshoot this one." Alert banner, no card | none |
| F8 Clarify | "The smoke alarm is beeping" | ask about the sound first, then the appliance | "Is it a short chirp every minute or so, or a loud alarm that keeps sounding?" → "Just a chirp" → "Which one, the hallway or the main bedroom?" → "Bedroom" → F3 for `ap_smoke_bed`; "It keeps sounding" → F7 | as F3 or none |

Error turns: tool errors are spoken from their message with one next step (for example an expired quote offers to re-price); "cancel" while a quote or options are pending clears them and says "Okay, I won't order it."; a code with nothing pending gets "There's nothing waiting for a code."

## 11. Planner (simulation host)

- **Default:** deterministic intent grammar plus plan executor (no keys, no network beyond the local server). Intents: briefing, upcoming, ask_due, reorder_part, symptom, choose_option, confirm (code, optional "approve"), cancel, done, book_service, choose_slot, register, help, out_of_scope. Each intent maps to a fixed plan with branches on tool results (ambiguous, on hand, over cap, error).
- **Guards before any tool call:** hazard guard (9.5 hazard phrases; "smoke alarm" alone is not a hazard); scope guard (non-upkeep requests get "I can help with home upkeep: filters, batteries, vents and repairs.").
- **Dialogue state per session:** pending options (expire after 3 turns), pending quote, last appliance, last task. Household memory is never kept in the host; it always comes from the server.
- **Dates:** "today", "tomorrow", weekday names, "next week" (Monday to Sunday), "morning" (before 12:00), "afternoon" (12:00 to 17:00), all relative to the sim clock.
- **Codes:** the host reads the code from a code turn (S2), masks it in the transcript and trace, passes it only to `confirm_purchase`, and never logs it or sends it to an LLM.
- **P1 LLM planner:** OpenAI-compatible chat endpoint via env, given the MCP tool list and the Agent Skill; at most 6 tool calls per turn; the same guards run first, and the code gate stays in host code, never in the model. Falls back to the deterministic planner on any failure.
- **Coverage:** unit table of at least 60 utterances (chips plus 3 paraphrases per intent) to intents and slots.

## 12. Functional requirements

| ID | Requirement | P | QA |
|---|---|---|---|
| FR-01 | Streamable HTTP endpoint with POST, DELETE, GET 405, on 127.0.0.1:8787 | P0 | B |
| FR-02 | Protocol 2025-11-25 negotiation and `MCP-Protocol-Version` validation | P0 | B |
| FR-03 | Sessions via `Mcp-Session-Id` with 400 and 404 semantics | P0 | B |
| FR-04 | Origin allowlist with 403; CORS for the browser host | P0 | B, E |
| FR-05 | Content negotiation and body validation (406, 415, 400, no batches) | P0 | B |
| FR-06 | 10 P0 tools with input and output schemas, annotations, speakable text, structured errors | P0 | B, C, D |
| FR-07 | 5 MCP Apps UI resources linked from visual tools | P0 | B, F |
| FR-08 | `/healthz` always; `/sim/*` only in sim mode | P0 | A, E |
| FR-10 | Durable home memory in SQLite surviving sessions and restarts | P0 | E, G |
| FR-11 | Status buckets (overdue, due today, coming up, in progress, tasks) | P0 | C, E |
| FR-12 | Appliance resolution: match, ambiguous, not found | P0 | C, G |
| FR-13 | Registration from catalog schedules, idempotent | P0 | C, E, G |
| FR-14 | Parts search: compatibility, policy exclusions with reasons, stock, recommendation | P0 | C, G |
| FR-15 | Symptom diagnosis and hazard flag | P0 | C, G |
| FR-16 | Service slots from fictional providers | P0 | C, G |
| FR-17 | Two-phase checkout: code, cap with approval, expiry, lockout, idempotency, server-side policy and compatibility checks | P0 | D, G |
| FR-18 | Order and booking lifecycle on the sim clock; arrival adds stock; install task | P0 | D, G |
| FR-19 | Tasks and maintenance logging (use stock, next due, close tasks) | P0 | C, D, G |
| FR-20 | Simulated clock, reset, deterministic IDs | P0 | E, I |
| FR-21 | Audit event for every write, with no code values | P0 | D |
| FR-30 | Device frame, SIMULATION and fictional-data labels, session and clock controls | P0 | G, J |
| FR-31 | Conversation: text input, transcript, chips, masked codes | P0 | G |
| FR-32 | Deterministic planner with guards and dialogue state (section 11) | P0 | G |
| FR-33 | MCP Apps host: sandboxed iframes, intents only, text-only mode | P0 | F |
| FR-34 | Trace panel with redaction | P0 | G |
| FR-35 | Data drawer, read-only | P0 | G |
| FR-36 | Proactive briefing at session start | P0 | G |
| FR-37 | Error states, recovery and accessibility | P0 | G |
| FR-40 | LLM planner via env (optional) | P1 | H |
| FR-41 | Agent Skill package | P1 | H |
| FR-42 | Progress notifications for `find_service_slots` | P1 | H |
| FR-43 | `set_preferences`, `get_home_profile`, `cancel_order` | P1 | H |
| FR-44 | Bearer-token option; voiced replies via browser speech synthesis | P1 | H |
| FR-45 | Open Source spin-off: transport acceptance suite repo | P2 | — |
| FR-46 | Microphone input | P2 | — |
| FR-47 | Elicitation-based confirmation as an alternative to the spoken code | P2 | — |

## 13. Non-functional requirements

| ID | Requirement | QA |
|---|---|---|
| NFR-01 | Zero-key, zero-cost run: `npm ci` then `npm run demo`; network needed only for package install | A, J |
| NFR-02 | Local performance with the deterministic planner: tool call p95 under 200 ms; utterance to rendered reply p95 under 1.5 s | I |
| NFR-03 | Determinism: same seed, clock and utterances give the same structured results and IDs | I |
| NFR-04 | Accessibility: WCAG 2.1 AA contrast, keyboard operation, `aria-live` replies, reduced motion, captions in the video | G, J |
| NFR-05 | Privacy: fictional data only, no telemetry or analytics | A, I |
| NFR-06 | Security: localhost bind, Origin allowlist, sandboxed cards, secrets only via env, codes and keys never logged | A, F, I |
| NFR-07 | Portability: Ubuntu, Node.js LTS, Chrome; no Docker or cloud account needed | J |
| NFR-08 | English UI, docs and video | J |

## 14. Stack

| Layer | Choice | Reason |
|---|---|---|
| Language and runtime | TypeScript (strict) on Node.js LTS | One language for server, host and tests; well-trodden for an AI coding CLI |
| MCP | Official MCP TypeScript SDK (server and client), pinned after the Day-0 check that it negotiates 2025-11-25 | Spec-faithful transport; fallback is a hand-rolled single-endpoint handler |
| HTTP | Express with the cors middleware | Matches the SDK's server examples; CORS lets the browser host on :5173 call :8787 |
| Schemas | zod, exported as JSON Schema for tool inputs and outputs | Single source of truth |
| Storage | SQLite file via better-sqlite3; `:memory:` for tests | Durable, zero-ops, deterministic |
| Simulator | Vite + React + TypeScript on :5173 | Fast iteration |
| Cards | Self-contained HTML, CSS and JS per template | Sandbox-safe and portable to other MCP Apps hosts |
| Tests | Vitest (unit and protocol over real HTTP), Playwright in Chrome with @axe-core/playwright (E2E, accessibility scan, video capture) | Brief lists Chrome and Playwright |
| CI | GitHub Actions on the public repo | Runs qa.md A to G on every push |
| Video | Playwright page recording of a scripted run; DashScope TTS `qwen3-tts-flash`, voice Cherry, key read from the `DASHSCOPE_API_KEY` environment variable by the video script only; ffmpeg to mux narration and captions; no music | Reproducible takes, brief-approved voice |
| Concept art | Google Flow, Devpost cover only, no logos, labelled concept art | Allowed by the brief |
| Build tool | Grok Build (AI coding CLI) on Ubuntu | Per brief |

## 15. Repository and configuration

    hearthkeep/
      apps/mcp-server/     transport, tools, ui:// resources, /healthz, /sim/*
      apps/simulator/      simulation host: frame, planner, MCP client, card host
      packages/core/       domain rules and repository interface
      data/seed/           fictional seed JSON (notice at the top of each file)
      skills/home-upkeep/  Agent Skill (P1)
      tests/protocol/      qa.md B to E
      tests/e2e/           qa.md F and G (Playwright)
      docs/                architecture, spec-notes, data-notice, video-script,
                           product-feedback, friction-log, feature-requests, devpost
      scripts/             demo runner, video capture and narration (reads env only)
      .env.example  LICENSE (MIT, Copyright 2026 Psyche)  README.md

| Env var | Default | Purpose |
|---|---|---|
| `HK_HOST`, `HK_PORT` | 127.0.0.1, 8787 | Bind address and port |
| `HK_DB` | `./data/hearthkeep.db` (git-ignored) | SQLite file; `:memory:` for tests |
| `HK_ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Origin allowlist |
| `HK_SIM_MODE` | 1 in `npm run demo` | Enables `/sim/*` and clock controls |
| `HK_SIM_START` | `2026-10-21T09:00:00-07:00` | Seed clock |
| `HK_PURCHASE_CODE` | 2468 in `.env.example` (demo only) | Mock payment confirmation code |
| `HK_JSON_RESPONSE` | 0 | 1 switches POST responses to JSON |
| `HK_AUTH_TOKEN` | unset | P1 static bearer token |
| `HK_LLM_BASE_URL`, `HK_LLM_API_KEY`, `HK_LLM_MODEL` | unset | P1 LLM planner; unset means deterministic |
| `DASHSCOPE_API_KEY` | unset | Video narration only; never needed to run the product |

`npm run demo` loads `.env` if present, otherwise `.env.example` (demo-safe values only). `.env` is git-ignored.

README must cover: what it is and the simulation disclosure; prerequisites; install, run, test, E2E; env table; demo script (chips in order); data notice; architecture link; troubleshooting (ports, Origin, reset); license.

## 16. Security and privacy

Localhost bind, Origin allowlist and allowlist-only CORS on every route; no auth on localhost by design, documented; cards in `allow-scripts` sandboxes with no same-origin access and no network; purchase codes masked in the UI and redacted in trace, logs and audit; secrets only from env and never logged; no real personal data, brands, prices or providers; mock payment only.

## 17. Out of scope

- Live Alexa+ connection, account linking, certification or publishing.
- Real purchases, payments, carts, retailer catalogs, price lookups or affiliate links.
- Real service providers, calendars, email, SMS or push notifications.
- Any hardware: Fire TV, Ring, Bee, Apple Watch, Echo devices, smart appliances.
- Computer vision of any kind, such as reading model stickers from photos (brief: no CV).
- AWS services and the AWS Builder mini challenge (no credits; adapters only).
- OAuth 2.1 authorization, multi-tenant accounts, voice profiles or speaker identification.
- Wake word, real speech recognition (P2 mic only), languages other than English.
- Electrical, gas or medical troubleshooting; hazards always get the safety message.
- Mobile apps, Fire TV dashboards, Ring package events (listed under "What's next" only).

## 18. Demo video plan (target 2:50, hard limit under 3:00)

| Time | Shot | Narration (Cherry) |
|---|---|---|
| 0:00-0:12 | Title card: name, "Alexa+ track", "Simulation" | Upkeep you only notice when something beeps |
| 0:12-0:24 | Architecture diagram | A real MCP server (2025-11-25, Streamable HTTP) behind a simulated Alexa+ experience |
| 0:24-0:40 | F1 briefing with C1 | It speaks first, from memory |
| 0:40-1:20 | F2 with C2, C3, C4 and a trace glimpse | Exact-fit part, policy filter, code-gated mock purchase |
| 1:20-1:45 | F3 | Uses what you already own |
| 1:45-2:12 | F4 | Books the pro; the limit is enforced by the server |
| 2:12-2:27 | F5 Next morning, then F7 in 5 s | New session, same memory; safety beats shopping |
| 2:27-2:42 | Trace raw JSON, test run summary, MIT | Verifiable protocol behaviour and open source |
| 2:42-2:50 | Close: repo URL as text, "Fictional sample data. Simulated Alexa+ experience." | Call to action |

Capture the page only (Playwright recording, no browser or OS chrome). Assistant replies appear as on-screen text, voiced with a second DashScope voice only if the Day-0 test passes; burned-in captions carry the narration. No music and no Amazon or Alexa logos. Narration is generated from `docs/video-script.md`.

## 19. Devpost fields (draft; confirm exact field names on the form)

| Field | Draft |
|---|---|
| Project name | Hearthkeep |
| Tagline | The Alexa+ agent that remembers your home: it tracks filters, batteries and vents, buys the exact part only with your code, and books the pro. |
| Track | Alexa+ (simulated Alexa+ experience web app + self-hosted MCP server, spec 2025-11-25, Streamable HTTP) |
| Built with | typescript, node.js, express, model-context-protocol, mcp-apps, streamable-http, sqlite, react, vite, playwright, vitest, github-actions (plus agent-skills if P1 ships) |
| Try it out | Public GitHub repo, MIT (URL added at publish time) |
| Video | Public YouTube or Vimeo link, under 3:00 |
| Gallery | 3 to 5 simulator screenshots with the SIMULATION ribbon; architecture diagram; optional concept cover labelled as concept art |
| Simulation disclosure | "Hearthkeep uses the simulated Alexa+ experience path. The web app simulates an Alexa+ household assistant and does not connect to Alexa+. The MCP server is real, implements MCP 2025-11-25 over Streamable HTTP, and handles every household lookup and action at runtime. All data is fictional." |
| What it does | Sections 3 and 10 of this PRD, in prose |
| How we built it | Sections 6, 7 and 14, rewritten against what actually shipped |
| Challenges, accomplishments, what we learned | Written only from `docs/friction-log.md` and build notes; nothing pre-filled |
| What's next | Attach the server to a real MCP host such as Alexa+ when access allows; real catalog, booking and payment adapters; Ring package events marking parts delivered; multi-home mode for landlords and caregivers |
| Testing instructions | Clone; `npm ci`; `npm run demo`; open http://127.0.0.1:5173; click the chips in order; `npm test` and `npm run test:e2e`. No keys needed |
| Product feedback | Section 20 |
| Friction log | Section 21 |
| Feature requests | Section 22 |
| Mini challenges | Open Source only if FR-45 ships; AWS Builder not entered |

Every claim is re-checked against the shipped build before submitting (qa.md J).

## 20. Product feedback plan (per tool)

Fields per tool, as the brief requires: tools used, what worked, what needs work, onboarding, would build again (yes or no plus one reason).

| Tool | Required? | Features we will actually touch |
|---|---|---|
| Alexa+ (developer docs, simulated-experience path rules) | Yes, track tool | Track rules, MCP and Agent Skill guidance, simulation requirements |
| Model Context Protocol 2025-11-25, Streamable HTTP | Yes | Version negotiation, sessions, headers, tool output schemas, errors |
| MCP TypeScript SDK | Yes | Server transport, client, tool and resource registration |
| MCP Apps | Yes | UI resources, host bridge, sandboxing |
| Agent Skills | If P1 ships | Skill packaging for the LLM planner |
| Playwright, Grok Build, DashScope TTS | Optional, if the form allows | Testing and capture, AI-assisted build, narration |

Process: `docs/product-feedback.md` has one section per tool; add dated notes at each milestone in section 2, with versions and links to friction-log IDs as evidence. Write the final entries from those notes only: specific, versioned, no speculation, nothing invented.

## 21. Friction log plan (optional, up to +10%)

- **Where:** `docs/friction-log.md`, IDs FL-01 and up, logged within 15 minutes of the event while the steps are fresh.
- **Fields (brief):** task, steps, expected vs actual, severity, workaround, suggestion. **Plus:** timestamp (Asia/Shanghai), tool and version, time lost, evidence (error text, screenshot path, doc URL).
- **Severity:** Blocker (no workaround, work stopped); High (workaround cost over 1 hour or forced a design change); Medium (workaround under 1 hour); Low (docs, naming, polish).
- **Log when:** any surprise costing over 10 minutes, any doc gap, any error message that did not explain itself.
- **Watch list (log only what actually happens):** Alexa+ builder onboarding without a device; how to attach a self-hosted MCP server to Alexa+ for testing; clarity of the simulated-path rules (labelling, what counts as an agentic tool); SDK support for 2025-11-25; Streamable HTTP header and session edge cases; MCP Apps host bridge docs and examples; Devpost fields for feedback and friction entries.
- **Target:** 6 to 10 entries with reproducible steps and a concrete suggestion each. Before submitting: dedupe, drop anything speculative, keep a neutral tone, link each entry to a product-feedback point.

## 22. Feature requests plan (optional)

Submit only requests that a real friction entry supports. Candidates to confirm during the build: a device-free Alexa+ test console that can attach a self-hosted Streamable HTTP MCP server; a published matrix of which MCP features Alexa+ supports as a host (MCP Apps, progress, elicitation); a sandbox purchasing mode for agent developers (test orders and confirmations); a reference kit for the simulated-experience path (required labels and disclosure wording).

## 23. Assumptions and open questions

1. "No CV" is read as no computer vision.
2. "Using any agentic tool" can mean the agent inside the app or the agentic tool used to build it; we cover both (the host's agent loop, and Grok Build). A deterministic planner may still not count as agentic. Mitigation: server-side workflows, the trace panel, and the P1 LLM planner shown in the video if it ships.
3. Exact MCP Apps metadata keys, MIME type and bridge message names are pinned on Day 0 [verify D0].
4. GitHub username and final repo URL are not in the brief; placeholders until publishing.
5. Devpost field names are confirmed when the submission form is opened.
6. Whether a second qwen3-tts-flash voice works for assistant replies is tested on Day 0; otherwise replies stay as on-screen text.
