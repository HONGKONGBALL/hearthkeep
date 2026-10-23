# Video script

Narration is English, spoken by DashScope `qwen3-tts-flash` voice Cherry. `scripts/narrate-demo.mjs` reads `DASHSCOPE_API_KEY` from the environment first and falls back to a local secrets file only when the variable is unset. The key is not stored in this repository. There is no music. Assistant replies stay on screen as text. The page is recorded without browser or operating-system chrome.

Times are seconds. The picture ends at 128.5 seconds.

| Id | Start | End | Shot | Narration |
|---|---|---|---|---|
| L1 | 0 | 5.7 | Title card: Hearthkeep, Alexa+ track, Simulation | Upkeep you only notice when something beeps. |
| L2 | 5.7 | 17.7 | Architecture diagram: simulator, MCP server, rules, SQLite | A real MCP server, spec 2025-11-25 over Streamable HTTP, behind a simulated Alexa+ experience. |
| L3 | 17.7 | 27.7 | F1 morning briefing and the status card | The simulator speaks first. |
| L4 | 27.7 | 51.7 | F2 exact-fit filter, checkout, mock receipt, trace glimpse | Exact-fit part, policy filter, code-gated mock purchase. |
| L5 | 51.7 | 68.7 | F3 chirping hallway alarm, then the battery already on the shelf | It uses what you already own. |
| L6 | 68.7 | 90.5 | F4 dryer-vent booking, Tuesday morning, server cap | It places a mock booking with the pro. The limit is enforced by the server. |
| L7 | 90.5 | 105.5 | F5 next morning, then F7 gas smell | New session, same memory. Safety beats shopping. |
| L8 | 105.5 | 120.5 | Trace raw JSON, test commands, MIT license | Verifiable protocol behaviour, and open source. |
| L9 | 120.5 | 128.5 | Close card with the repository URL and the simulation disclosure | Fictional sample data. Simulated Alexa+ experience. |

Cuts and gap narration (rc4-psyche10). The finished file is 128.5 seconds. Starting from the 154-second rc4-psyche9 cut, four static stretches were removed: 5.5-11.8 (title card), 33-39 (status card), 80.5-88.5 (smoke alarm result) and 110.3-115.5 (booking result), on top of the 64-80 second trace view removed in rc4-psyche9. Thirteen extra lines fill the pauses so no pause is longer than 5 seconds. They are audio only: captions are burned into the picture and the picture was trimmed, not re-rendered from the page recording, so these lines have no on-screen caption. They are not cues; `npm run demo:video` does not yet produce this cut.

| Id | Start | Shot | Narration |
|---|---|---|---|
| A1 | 20.0 | Status card | Dryer vent cleaning is twenty-one days overdue, and the fridge water filter is due today. |
| G1 | 32.5 | Filter cards, then checkout | The certified CX-28 is the cheapest filter the rules allow, and an uncertified one is filtered out. |
| G2 | 40.7 | Mock order ord_0001 | After a masked purchase code, a mock order is placed, with no real payment. |
| G3 | 45.7 | Trace panel | Get upkeep status, resolve appliance, and find parts all returned two hundred. |
| B1 | 54.5 | Smoke alarm reply and swap task | Two nine-volt batteries are already on the garage shelf, so nothing is bought, and a swap task is added. |
| B2 | 61.7 | Swap done | After the swap, one nine-volt is left, and the next change is due October 2027. |
| C1 | 72.8 | Three openings | The earliest opening is Tuesday, nine to eleven, for eighty-nine dollars. |
| C2 | 78.0 | Over-limit checkout | That is over the sixty dollar limit, so it needs approval and the purchase code. |
| C3 | 83.7 | Booking bk_0001 | The mock booking for Tuesday morning is confirmed, with no real purchase or payment. |
| D1 | 94.3 | New-session briefing | The next morning, the filter has shipped, and the vent cleaning is still booked for Tuesday. |
| D2 | 100.1 | Gas smell reply | For a gas smell, it tells you to leave the home and call your local emergency number. |
| E1 | 109.5 | Trace raw JSON | The trace shows the raw JSON for this session. |
| E2 | 112.7 | MIT license card | It is MIT licensed, with npm test and npm run test e2e. |

Household names, prices, and the demo purchase code are fictional sample data.

Record, narrate, and assemble:

```bash
npm run demo:video
```

That writes `/workspace/demo/amazon-demo.mp4`. The product itself does not call DashScope. `npm run demo` and `npm test` stay zero-key.
