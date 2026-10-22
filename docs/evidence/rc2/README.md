# rc2 raw evidence

Release candidate rc2. This directory holds the raw test outputs and reports that `BUILD-RC2.txt` at the repo root cites. Screenshots live in `docs/screens/rc2/`.

Household names, prices, and the purchase code in those runs are fictional sample data. Logs must not contain secrets.

## Files this record expects

| Path | What it is |
| --- | --- |
| `vitest.txt` | Raw stdout and stderr of `npm test` (Vitest), including the summary line. |
| `playwright.txt` | Raw stdout and stderr of `npm run test:e2e` (Playwright), including the summary line. |
| `vitest-report.json` | Machine-readable Vitest report from that same run. |
| `playwright-report/` | Playwright HTML report (`index.html`). The repo-root `playwright-report/` directory is gitignored, so the copy that belongs to this record lives here. |
| `playwright-report.json` | Machine-readable Playwright JSON report from that same run. |
| `perf.txt` | P-13 raw per-turn timings. Cases 64, 65, 67, and 68, three Chrome runs each. Reply and settled milliseconds, and the p95. |
| `f8-measure.txt` | Stdout and stderr of the command that wrote `perf.txt`. |
| `f8-vitest.txt` | Raw stdout and stderr of `npm test` after the P-13 timings were recorded. |
| `ci-local.txt` | Local run of the `.github/workflows/ci.yml` steps: `npm ci`, `npx playwright install chrome`, `npm test`, `npm run test:e2e`. |
| `fresh-clone.log` | README commands from a fresh clone as user `hkfresh` on Ubuntu 24.04. |
| `f9-vitest.txt` | Raw stdout and stderr of `npm test` in the workspace after the About license line. |

`BUILD-RC2.txt` stores the `git rev-parse HEAD` value, each command, and each exit code, and points at these paths. On the delivery commit that hash equals `HEAD`. After the `rc2` tag exists, `git rev-parse rc2^{commit}` equals that hash, and `git show rc2:BUILD-RC2.txt` contains the same hash and these paths.

The card-tap fix filled `vitest.txt`, `vitest-report.json`, `playwright.txt`, `playwright-report.json`, and `playwright-report/index.html` from a clean worktree at `3d7c059249bc2d78aed262e498f40f2ec0704e1e`. The Playwright files are the second `npm run test:e2e` run. The `rc2` tag is not created in that step.
