# Video script

Narration is English, spoken by DashScope `qwen3-tts-flash` voice Cherry. `scripts/narrate-demo.mjs` reads `DASHSCOPE_API_KEY` from the environment first and falls back to a local secrets file only when the variable is unset. The key is not stored in this repository. There is no music. Assistant replies stay on screen as text. The page is recorded without browser or operating-system chrome.

Times are seconds. The picture ends at 154 seconds.

| Id | Start | End | Shot | Narration |
|---|---|---|---|---|
| L1 | 0 | 12 | Title card: Hearthkeep, Alexa+ track, Simulation | Upkeep you only notice when something beeps. |
| L2 | 12 | 24 | Architecture diagram: simulator, MCP server, rules, SQLite | A real MCP server, spec 2025-11-25 over Streamable HTTP, behind a simulated Alexa+ experience. |
| L3 | 24 | 40 | F1 morning briefing and the status card | The simulator speaks first. |
| L4 | 40 | 64 | F2 exact-fit filter, checkout, mock receipt, trace glimpse | Exact-fit part, policy filter, code-gated mock purchase. |
| L5 | 64 | 89 | F3 chirping hallway alarm, then the battery already on the shelf | It uses what you already own. |
| L6 | 89 | 116 | F4 dryer-vent booking, Tuesday morning, server cap | It places a mock booking with the pro. The limit is enforced by the server. |
| L7 | 116 | 131 | F5 next morning, then F7 gas smell | New session, same memory. Safety beats shopping. |
| L8 | 131 | 146 | Trace raw JSON, test commands, MIT license | Verifiable protocol behaviour, and open source. |
| L9 | 146 | 154 | Close card with the repository URL and the simulation disclosure | Fictional sample data. Simulated Alexa+ experience. |

Cut and gap narration (rc4-psyche9). The finished file was cut from 170 to 154 seconds: the static trace view from 64 to 80 seconds of the rc4-psyche8 cut was removed, so the trace panel is on screen for about 7.4 seconds (56.6 to 64.0), and every later cue moved 16 seconds earlier. Three extra lines fill the L4 shot so no pause there is longer than 5 seconds. They are audio only: captions are burned into the picture and the picture was trimmed, not re-rendered from the page recording, so these lines have no on-screen caption. They are not cues; `npm run demo:video` does not yet produce this cut.

| Id | Start | Shot | Narration |
|---|---|---|---|
| G1 | 44.8 | Filter cards, then checkout | The certified CX-28 is the cheapest filter the rules allow, and an uncertified one is filtered out. |
| G2 | 53.0 | Mock order ord_0001 | After a masked purchase code, a mock order is placed, with no real payment. |
| G3 | 58.0 | Trace panel | Get upkeep status, resolve appliance, and find parts all returned two hundred. |

Household names, prices, and the demo purchase code are fictional sample data.

Record, narrate, and assemble:

```bash
npm run demo:video
```

That writes `/workspace/demo/amazon-demo.mp4`. The product itself does not call DashScope. `npm run demo` and `npm test` stay zero-key.
