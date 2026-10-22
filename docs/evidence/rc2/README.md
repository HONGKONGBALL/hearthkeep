# rc2 raw evidence

Release candidate rc2. This directory holds the raw test outputs and reports that `BUILD-RC2.txt` at the repo root cites. Screenshots live in `docs/screens/rc2/`.

Household names, prices, and the purchase code in those runs are fictional sample data. Logs must not contain secrets.

## Files this record expects

| Path | What it is |
| --- | --- |
| `vitest.txt` | Raw stdout and stderr of `npm test` (Vitest), including the summary line. |
| `playwright.txt` | Raw stdout and stderr of `npm run test:e2e` (Playwright), including the summary line. |
| `vitest-report.json` | Machine-readable Vitest report from that same run. |
| `playwright-report/` | Playwright HTML report. The repo-root `playwright-report/` directory is gitignored, so the copy that belongs to this record lives here. |

`BUILD-RC2.txt` stores the `git rev-parse HEAD` value, each command, and each exit code, and points at these paths. On the delivery commit that hash equals `HEAD`. After the `rc2` tag exists, `git rev-parse rc2^{commit}` equals that hash, and `git show rc2:BUILD-RC2.txt` contains the same hash and these paths.

This conventions step adds the directory and this list. The log files and the reports are filled in when the rc2 record is run.
