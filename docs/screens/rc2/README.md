# rc2 screenshots

Release candidate rc2. PNG screenshots for the UI review go in this directory. The verification record is `BUILD-RC2.txt` at the repo root. Raw Vitest and Playwright output goes in `docs/evidence/rc2/`.

Capture the simulator (`apps/simulator`) against the local MCP server. Household data on screen is fictional. Keep the simulation ribbon in the frame.

The PNG files in this directory were captured from the simulator on the local MCP server. Required shots were taken with `scripts/capture-rc2-screens.ts`. The f3, f4, and f5 shots were taken by the Playwright specs named in those sections.

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
| About | `about.png` | About panel: deterministic offline planner, SQLite, mock payment, fictional catalog, and the line License: MIT. |
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

## Chunk f4a review shots

These frames check the focus ring on the dark controls. They are not substitutes for the required shots above.

| Id | File | What the frame shows |
| --- | --- | --- |
| f4a new session | `f4a-focus-new-session.png` | New session focused. Light ring on the green button, dark ring on the page. |
| f4a next morning | `f4a-focus-next-morning.png` | Next morning focused, same two-tone ring. |
| f4a reset | `f4a-focus-reset-demo.png` | Reset demo focused. |
| f4a trace | `f4a-focus-trace.png` | Trace focused, not pressed. |
| f4a data | `f4a-focus-data.png` | Data focused. |
| f4a cards | `f4a-focus-cards.png` | Cards focused while pressed. Rust fill, light ring still separate. |
| f4a voice | `f4a-focus-voice.png` | Voice focused on the second row. The ring meets the page, not the button above. |
| f4a about | `f4a-focus-about.png` | About focused. |
| f4a trace pressed | `f4a-focus-trace-pressed.png` | Trace pressed and focused. The rust fill is not the focus ring. |
| f4a retry | `f4a-focus-retry.png` | Retry focused on the red banner. Dark ring on the white button, light ring on the banner. |

## Chunk f4b review shots

These frames check that Tab stays on the welcome dialog. They are not substitutes for the required shots above.

| Id | File | What the frame shows |
| --- | --- | --- |
| f4b welcome | `f4b-welcome-tab.png` | After Tab from Start at 1280×800. Focus remains on Start. The clock still reads Wed, Oct 21, 2026 · 9:00 AM. |
| f4b welcome 390 | `f4b-welcome-tab-390.png` | Same dialog at 390 px wide. Start stays inside the sheet. |

## Chunk f4c review shots

These are the required C1–C5 frames, captured at 1280×800 after the card layout fix. Each card document fits in the display (`scrollHeight <= clientHeight`).

| Id | File | What the frame shows |
| --- | --- | --- |
| C1 | `c1-status-card.png` | Status card. Dryer vent, fridge filter, hallway battery, and furnace filter are all on screen. Each action sits in the same bordered row as its item. |
| C2 | `c2-options-carousel.png` | Fridge filter options side by side. Both Choose actions and the Bargo ZX-28 exclusion footer are visible. |
| C3 | `c3-checkout-card.png` | Checkout for Rillstone CX-28. Total, arrival, the $60 limit, and Confirm by voice are visible. |
| C4 | `c4-receipt-card.png` | Mock receipt ord_0001, Placed, and the no-payment line. |
| C5 | `c5-task-card.png` | Open task to swap the hallway smoke alarm battery, with Due, Appliance, Supplies, and Mark done. |

## Chunk f5 review shots

These frames check the session handshake in the trace. They are not substitutes for the required shots above.

| Id | File | What the frame shows |
| --- | --- | --- |
| f5 session | `f5-session-initialized.png` | Trace open after Start at 1280×800. Session opened lists initialize 200 session, then notifications/initialized 202 session. |
| f5 session 390 | `f5-session-initialized-390.png` | Same session trace at 390 px wide. Both handshake lines are on screen. |

## Chunk f9 review shots

These frames check that the About dialog shows the MIT license. `about.png` is the required About shot.

| Id | File | What the frame shows |
| --- | --- | --- |
| About | `about.png` | About dialog at 1280×800 after Start. The license line reads License: MIT. Close is on the sheet. |
| f9 about 390 | `f9-about-390.png` | Same dialog at 390 px wide. License: MIT and Close stay inside the sheet. |
