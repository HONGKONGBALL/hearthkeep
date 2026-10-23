# Video script

Narration is English, spoken by DashScope `qwen3-tts-flash` voice Cherry. `scripts/narrate-demo.mjs` reads `DASHSCOPE_API_KEY` from the environment first and falls back to a local secrets file only when the variable is unset. The key is not stored in this repository. There is no music. Assistant replies stay on screen as text. The page is recorded without browser or operating-system chrome.

Times are seconds. The picture ends at 142.16 seconds.

| Id | Start | End | Shot | Narration |
|---|---|---|---|---|
| L1 | 0 | 5.7 | Title card: Hearthkeep, Alexa+ track, Simulation | Upkeep you only notice when something beeps. |
| L2 | 5.7 | 17.7 | Architecture diagram: simulator, MCP server, rules, SQLite | A real MCP server, spec 2025-11-25 over Streamable HTTP, behind a simulated Alexa+ experience. |
| L3 | 17.7 | 27.7 | F1 morning briefing and the status card | The simulator speaks first. |
| L4 | 27.7 | 59.34 | F2 exact-fit filter, checkout, mock receipt, trace glimpse | Exact-fit part, policy filter, code-gated mock purchase. |
| L5 | 59.34 | 76.34 | F3 chirping hallway alarm, then the battery already on the shelf | It uses what you already own. |
| L6 | 76.34 | 100.92 | F4 dryer-vent booking, Tuesday morning, server cap | It places a mock booking with the pro. The limit is enforced by the server. |
| L7 | 100.92 | 116.96 | F5 next morning, then F7 gas smell | New session, same memory. Safety beats shopping. |
| L8 | 116.96 | 134.16 | Trace raw JSON, test commands, MIT license | Verifiable protocol behaviour, and open source. |
| L9 | 134.16 | 142.16 | Close card with the repository URL and the simulation disclosure | Fictional sample data. Simulated Alexa+ experience. |

Cuts, holds and gap narration (rc4-psyche12). The finished file is 142.16 seconds. It is cut from the original 170-second page recording: kept 0-5.5, 11.8-33, 39-64, 80-96.5, 104.5-125 and 131.5-141, 145.5-170. Four still-frame holds keep the picture on what the extra line describes: the filter cards are held 7.64 s so G1 ends before the checkout appears and the receipt appears only after G2 starts; the three openings are held 4.08 s through C1; the new-session briefing is held 5.54 s through D1; the trace raw JSON is held 2.2 s so E1 ends before the MIT license card appears. 10 added lines, 13 total with retained G1-G3, fill the pauses so no pause is longer than 5 seconds. The picture is re-rendered from the uncaptioned page recording, and every one of the 22 spoken lines (L1-L9 and these 13) has its own burned-in caption, shown from the line's start until its audio ends plus 0.4 s (never past the next line's start), so no caption spans another line. The same 22 captions are in `docs/video/hearthkeep-demo.srt` for upload as closed captions. The 13 lines are not cues; `npm run demo:video` does not yet produce this cut (build steps: `docs/evidence/rc4/psyche12/build-psyche12.py`).

| Id | Start | Shot | Narration |
|---|---|---|---|
| A1 | 20 | Status card | Dryer vent cleaning is twenty-one days overdue, and the fridge water filter is due today. |
| G1 | 32.3 | Filter cards (held on a still frame until the line ends) | The certified CX-28 is the cheapest filter the rules allow, and an uncertified one is filtered out. |
| G2 | 44.64 | Mock order ord_0001 | After a masked purchase code, a mock order is placed, with no real payment. |
| G3 | 53.34 | Trace panel | Get upkeep status, resolve appliance, and find parts all returned two hundred. |
| B1 | 62.14 | Smoke alarm reply and swap task | Two nine-volt batteries are already on the garage shelf, so nothing is bought, and a swap task is added. |
| B2 | 69.34 | Swap done | After the swap, one nine-volt is left, and the next change is due October 2027. |
| C1 | 80.34 | Three openings (held on a still frame until the line ends) | The earliest opening is Tuesday, nine to eleven, for eighty-nine dollars. |
| C2 | 85.52 | Over-limit checkout | That is over the sixty dollar limit, so it needs approval and the purchase code. |
| C3 | 91.12 | Booking bk_0001 | The mock booking for Tuesday morning is confirmed, with no real purchase or payment. |
| D1 | 104.72 | New-session briefing (held on a still frame until the line ends) | The next morning, the filter has shipped, and the vent cleaning is still booked for Tuesday. |
| D2 | 110.76 | Gas smell reply | For a gas smell, it tells you to leave the home and call your local emergency number. |
| E1 | 120.96 | Trace raw JSON (held on a still frame until the line ends) | The trace shows the raw JSON for this session. |
| E2 | 126.36 | MIT license card | It is MIT licensed, with npm test and npm run test e2e. |

Household names, prices, and the demo purchase code are fictional sample data.

Record, narrate, and assemble:

```bash
npm run demo:video
```

That writes `/workspace/demo/amazon-demo.mp4`. The product itself does not call DashScope. `npm run demo` and `npm test` stay zero-key.
