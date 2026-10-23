# rc4 raw evidence

Release candidate rc4. This directory holds the raw outputs that `BUILD-RC4.txt` cites. Screenshots are in `docs/screens/rc4/`. The demo file is `docs/demo/hearthkeep-demo.mp4`.

Household names, prices, and the purchase code in these runs are fictional sample data. Logs must not contain secrets.

The full-suite logs below were taken on `c44840c8109ac24fc1d726e3f22fddd3315a7b6e`. Each starts with `git rev-parse HEAD` and `git status --short`. Earlier per-fix logs stay in this directory. The previous full-suite bytes, from chunk r7, remain in git history at that parent commit: `vitest.txt` sha256 `33c38086ed5e618282114fd1239a87b258b0157408668e2ae7aa28098dec5d8a`, `playwright.txt` sha256 `2e8991c2b24137145931d1e83d3f710a4434933a0049d07fbf7d68622293f1d3`.

| Path | What it is |
| --- | --- |
| `vitest.txt` | `npm test` on the described commit. 231 passed. |
| `vitest-report.json` | Vitest JSON from that run. |
| `playwright.txt` | `npm run test:e2e` in Chrome. 41 passed. |
| `playwright-report.json` | Playwright JSON from that run. |
| `playwright-report/` | Playwright HTML report. |
| `perf.txt` | P-13 UI timings on the described commit. 30 samples. Verdict PASS. |
| `fresh-clone.log` | README commands in `/tmp/hk-fresh`, a bundle clone of the described commit. |
| `a1-vitest.txt`, `a1-playwright.txt` | Chunk r2 status-row logs. |
| `a4-vitest.txt`, `a4-playwright.txt` | Chunk r3 over-cap voice logs. |
| `a5-playwright.txt` | Chunk r5 task-card skin log. |
| `a6-vitest.txt`, `a6-playwright.txt` | Chunk r4 Mark done logs. |
| `a3-caption-contrast.txt`, `a3-frames/` | Chunk r8 caption contrast for the demo file. |
