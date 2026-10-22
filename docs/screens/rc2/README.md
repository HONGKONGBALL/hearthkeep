# rc2 screenshots

Release candidate rc2. PNG screenshots for the UI review go in this directory. The verification record is `BUILD-RC2.txt` at the repo root. Raw Vitest and Playwright output goes in `docs/evidence/rc2/`.

Capture the simulator (`apps/simulator`) against the local MCP server. Household data on screen is fictional. Keep the simulation ribbon in the frame.

This conventions step adds the directory and this list. The PNG files are captured when the rc2 record is filled.

## Required shots

| Id | File | What the frame shows |
| --- | --- | --- |
| S0 | `s0-welcome.png` | Welcome overlay before Start. Simulated household agent, fictional-data notice, Start. |
| S1 | `s1-briefing.png` | First briefing after Start, with the upkeep status card. |
| C1 | `c1-status-card.png` | Status card (`ui://hearthkeep/status-card.html`). |
| C2 | `c2-options-carousel.png` | Options carousel (`ui://hearthkeep/options-carousel.html`). |
| C3 | `c3-checkout-card.png` | Checkout card (`ui://hearthkeep/checkout-card.html`). |
| C4 | `c4-receipt-card.png` | Receipt card (`ui://hearthkeep/receipt-card.html`). |
| C5 | `c5-task-card.png` | Task card (`ui://hearthkeep/task-card.html`). |
| Trace | `trace.png` | Trace panel open. Purchase code redacted. |
| Data | `data.png` | Data drawer open. |
| About | `about.png` | About panel: deterministic offline planner, SQLite, mock payment, fictional catalog, MIT license. |
| Offline banner | `offline-banner.png` | Banner while the MCP server is down: "Can't reach the home server", with Retry. |
| Danger alert | `danger-alert.png` | Hazard alert (`p.alert`) for a sounding alarm or other safety short-circuit. |
| 390 px | `viewport-390.png` | Same product UI at a 390 px wide viewport. |
| 768 px | `viewport-768.png` | Same product UI at a 768 px wide viewport. |

Desktop shots use the 1280×800 page unless the row names another width. The 390 px and 768 px rows are the narrow and tablet pair. Add a shot by adding one row here and the same row in `BUILD-RC2.txt`.

## Chunk f3 review shots

These frames check the copy fixes. They are not substitutes for the required shots above.

| Id | File | What the frame shows |
| --- | --- | --- |
| f3 task | `f3-task-card.png` | Open battery task at 1280×800. Labels Due, Appliance, Supplies. Appliance reads Hallway smoke alarm. |
| f3 task 390 | `f3-task-card-390.png` | Same task card at 390 px wide. |
| f3 next due | `f3-task-next-due.png` | After the swap. The date label is Next due, and the date is the next battery change. |
| f3 limit | `f3-parts-limit.png` | Fridge filter checkout reply includes Within your $60 limit. |
| f3 one day | `f3-one-day-overdue.png` | Next morning from the seed. The fridge filter reads 1 day overdue. |
