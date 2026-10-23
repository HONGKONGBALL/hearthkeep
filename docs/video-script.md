# Video script

Narration is English, spoken by DashScope `qwen3-tts-flash` voice Cherry. `scripts/narrate-demo.mjs` reads `DASHSCOPE_API_KEY` from the environment first and falls back to a local secrets file only when the variable is unset. The key is not stored in this repository. There is no music. Assistant replies stay on screen as text. The page is recorded without browser or operating-system chrome.

Times are seconds. The picture ends at 170 seconds.

| Id | Start | End | Shot | Narration |
|---|---|---|---|---|
| L1 | 0 | 12 | Title card: Hearthkeep, Alexa+ track, Simulation | Upkeep you only notice when something beeps. |
| L2 | 12 | 24 | Architecture diagram: simulator, MCP server, rules, SQLite | A real MCP server, spec 2025-11-25 over Streamable HTTP, behind a simulated Alexa+ experience. |
| L3 | 24 | 40 | F1 morning briefing and the status card | The simulator speaks first. |
| L4 | 40 | 80 | F2 exact-fit filter, checkout, mock receipt, trace glimpse | Exact-fit part, policy filter, code-gated mock purchase. |
| L5 | 80 | 105 | F3 chirping hallway alarm, then the battery already on the shelf | It uses what you already own. |
| L6 | 105 | 132 | F4 dryer-vent booking, Tuesday morning, server cap | It places a mock booking with the pro. The limit is enforced by the server. |
| L7 | 132 | 147 | F5 next morning, then F7 gas smell | New session, same memory. Safety beats shopping. |
| L8 | 147 | 162 | Trace raw JSON, test summary, MIT license | Verifiable protocol behaviour, and open source. |
| L9 | 162 | 170 | Close card with the repository URL and the simulation disclosure | Fictional sample data. Simulated Alexa+ experience. |

Household names, prices, and the demo purchase code are fictional sample data.

Record, narrate, and assemble:

```bash
npm run demo:video
```

That writes `/workspace/demo/amazon-demo.mp4`. The product itself does not call DashScope. `npm run demo` and `npm test` stay zero-key.
