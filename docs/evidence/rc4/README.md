# rc4 raw evidence

Chunk r1 (A2) of release candidate rc4. This directory holds the raw test outputs and reports that `BUILD-RC4.txt` at the repo root cites. Screenshots for the hazard turn and the following briefing live in `docs/screens/rc4/`.

Household names, prices, and the purchase code in those runs are fictional sample data. Logs must not contain secrets.

## Files this record expects

| Path | What it is |
| --- | --- |
| `vitest.txt` | Raw stdout and stderr of `npm test` (Vitest), including the summary line and VITEST_EXIT. |
| `playwright.txt` | Raw stdout and stderr of `npm run test:e2e` (Playwright), including the summary line and E2E_EXIT. |
| `vitest-report.json` | Machine-readable Vitest report from that same run. |
| `playwright-report/` | Playwright HTML report (`index.html`). |
| `playwright-report.json` | Machine-readable Playwright JSON report from that same run. |

Chunk r2 (A1) added `a1-vitest.txt` and `a1-playwright.txt`. Those are the raw logs for the status-row fix. `CHUNKr2.txt` at the repo root cites them. The A2 files above are unchanged.

Chunk r3 (A4) added `a4-vitest.txt` and `a4-playwright.txt`. Those are the raw logs for the over-cap Confirm by voice reply. `CHUNKr3.txt` at the repo root cites them. The A1 and A2 files above are unchanged.

Chunk r4 (A6) added `a6-vitest.txt` and `a6-playwright.txt`. Those are the raw logs for Mark done choosing the task on the clicked row. `CHUNKr4.txt` at the repo root cites them. The A1, A2, and A4 files above are unchanged.

Chunk r7 replaced `vitest.txt`, `vitest-report.json`, `playwright.txt`, `playwright-report.json`, and `playwright-report/index.html` with the full `npm test` and `npm run test:e2e` run. Both logs start with `git rev-parse HEAD` and `git status`. `CHUNKr7.txt` cites them. The earlier per-fix logs (`a1-*`, `a4-*`, `a5-playwright.txt`, `a6-*`) are unchanged. The previous full-run bytes, which `CHUNKr1.txt` hashes, remain at commit `ea2523cb5780cf36c17718f7c819e194af843f5d`.
