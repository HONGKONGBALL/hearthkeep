# rc4-psyche7 evidence, tested commit e523db1

Tested commit: e523db13ffc4086ab47e4ddf1cfd3084641b703a (app, packages, tests and scripts identical to rc4-psyche6 = fafdbe4; git diff e523db1 fafdbe4 -- apps packages tests scripts is empty).
Run: 2026-10-23 19:01-19:05 (Asia/Shanghai, UTC+8), fresh git worktree detached at e523db1, npm ci, headless (DISPLAY unset), Node v20.19.2.
Ports: MCP HK_PORT=18799, simulator 5199. Port 5173 and 8787 were not bound or contacted.
Port override for e2e and P-13: three lines were edited in the worktree only and reverted before this commit (playwright.config.ts baseURL, tests/e2e/servers.ts SIM_URL/--port/origins, apps/simulator/vite.config.ts port: 5173 -> 5199). The exact diff is printed at the top of playwright.txt. Not committed.

## Supersedes
- docs/evidence/rc4/a3-caption-contrast.txt:6-8 (video md5 a12c58bb..., samples measured on pre-splice 36b9800b...) -> contrast.txt here, measured on the current video.
- BUILD-RC4.txt:84 and :88 (video md5 a12c58bb... and "md5 matches a3-caption-contrast.txt") -> current video md5 0da4dfa4d015d15197c9dd937b84cf1b, measured here.
- docs/evidence/rc4/vitest.txt:1-12 (HEAD c44840c, dirty tree) and the whole run in that file -> vitest.txt here.
- docs/evidence/rc4/playwright.txt:1-14 (HEAD c44840c, dirty tree) and the whole run in that file -> playwright.txt here.
- docs/evidence/rc4/perf.txt:16-18 (HEAD c44840c) and results at :85-95 -> perf.txt here.
The superseded files are process records and were not edited.

## 1. A3 caption contrast (current video)
Video: docs/demo/hearthkeep-demo.mp4, md5 0da4dfa4d015d15197c9dd937b84cf1b (same bytes at e523db1 and fafdbe4).
Method: same as a3-caption-contrast.txt (same 9 cue times, frame = time_s*30, box = bottom band y>=900 with max channel <=40, chroma <=14, luminance <0.02; glyph = every channel >=230 and luminance >=0.90; WCAG 2.1). One stricter change: instead of one hand-picked sample, worst_sample_contrast is the lowest glyph/box pair over every 7th glyph pixel with a box pixel 8-14 px above it. Script: a3-contrast.py. Command: python3 a3-contrast.py docs/demo/hearthkeep-demo.mp4 a3-frames
Result: 9 of 9 PASS (median / worst sample):
SUMMARY L1=18.88/14.74 L2=18.88/14.50 L3=18.41/15.00 L4=18.88/14.62 L5=18.88/15.00 L6=18.88/14.56 L7=18.88/14.06 L8=18.88/14.37 L9=18.88/13.88
Lowest median 18.41:1 (L3). Lowest worst sample 13.88:1 (L9). Threshold 4.5:1.

## 2. Vitest
Command: HK_PORT=18799 npx vitest run (unmodified tree, git status clean). Result: 19 files, 231 passed, 0 failed, exit 0. Log: vitest.txt.

## 3. Playwright
Command: HK_PORT=18799 npx playwright test --reporter=list (port override above). Result: 41 passed, 0 failed, 0 skipped, exit 0. Log: playwright.txt.

## 4. P-13
Command: HK_PORT=18799 HK_P13_OUT=perf.txt HK_P13_RELEASE=rc4-psyche7 HK_MEASURE_HEAD=e523db1... npx tsx scripts/measure-p13.ts
Note: perf.txt lines 6-7 are fixed strings in scripts/measure-p13.ts and still say 5173 and 8787; the actual run used 5199 and 18799.
Result: n=30, p95 reply_ms 33.100 ms, p95 settled_ms 48.800 ms, both < 1500 ms. verdict: PASS. Log: perf.txt.
