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
