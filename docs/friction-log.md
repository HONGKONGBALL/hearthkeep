# Friction log

Each entry is something that actually happened while building or checking Hearthkeep. Household names in the product are fictional sample data. Times are Asia/Shanghai.

## FL-01

- Timestamp: 2026-10-22 11:44:46
- Tool and version: Vitest 4.1.12
- Task: run `npm test` while a demo server was still listening
- Steps: start the MCP server on `127.0.0.1:8787`, then run the suite without stopping it
- Expected: case I84 passes on its own temporary server
- Actual: the run failed only I84 because a local server already held `127.0.0.1:8787`. After that process stopped, the suite passed, including I84. Source: `CHUNK3.txt`.
- Severity: Medium
- Time lost: not written down in the chunk note. The rerun itself was the full suite.
- Workaround: stop the process on 8787 and run `npm test` again
- Suggestion: when the listen fails, name the address and say a server is already bound, and point the health test at an ephemeral port when `HK_PORT` is not fixed
- Evidence: `CHUNK3.txt` note for 11:44:46
- Product feedback: Vitest and the local server

## FL-02

- Timestamp: 2026-10-20 15:56:47
- Tool and version: Vitest 3.x, then 4.1.12 (commit `1506a05`)
- Task: install the test runner
- Steps: lock the workspace, then run the health tests
- Expected: a current Vitest line with no advisory on `tinypool` or `@vitest/mocker`
- Actual: the 3.x line pulled advisory-affected `tinypool` and `@vitest/mocker` packages. The health tests passed after the upgrade to 4.1.12.
- Severity: Medium
- Time lost: not written down. The upgrade is one commit.
- Workaround: pin Vitest 4.1.12
- Suggestion: the scaffold should start on a release whose transitive test packages are not under that advisory
- Evidence: commit `1506a05`, message "The 3.x line pulled advisory-affected tinypool and @vitest/mocker packages."
- Product feedback: Vitest

## FL-03

- Timestamp: 2026-10-21 23:49:47
- Tool and version: local MCP server, protocol 2025-11-25 (commit `59ae867`)
- Task: expose the five card resources and advance a shipment when the sim clock moves
- Steps: call `initialize`, then advance the sim clock after a mock order
- Expected: `initialize` lists the card resources, visual tools point at them, and the clock marks the order shipped
- Actual: before this commit, initialize did not advertise the resources and the clock did not advance shipment. Tool errors that the QA cases require as one sentence were also adjusted in the same commit.
- Severity: High
- Time lost: not written down. The fix landed before the protocol suite was treated as done.
- Workaround: none other than the code change in `59ae867`
- Suggestion: keep the resource list and the one-sentence error text in the protocol tests so a later transport edit cannot drop them quietly
- Evidence: commit `59ae867`
- Product feedback: MCP 2025-11-25 server

## FL-04

- Timestamp: 2026-10-22 12:25:59
- Tool and version: Playwright 1.64.1, Chrome channel (commit `dc1572a`)
- Task: run the Chrome suite as the acceptance user
- Steps: start the MCP server and the simulator from the Playwright global setup and write their logs
- Expected: the acceptance user can replace the server logs on each run
- Actual: that user cannot append to the sticky `/tmp` logs. The run now truncates `tests/e2e/.logs/mcp.log` and `sim.log`.
- Severity: Medium
- Time lost: not written down. The path change is one commit.
- Workaround: keep the logs under `tests/e2e/.logs`
- Suggestion: any future runner should write logs inside the workspace, in a directory the acceptance user can replace
- Evidence: commit `dc1572a`
- Product feedback: Playwright

## FL-05

- Timestamp: 2026-10-22 12:31
- Tool and version: repository docs as of commit `dc1572a` (README, `docs/architecture.md`, `docs/spec-notes.md`)
- Task: follow the README to run the demo and find the ordered chip script
- Steps: read `README.md`, `docs/architecture.md`, and `docs/spec-notes.md` while preparing the video
- Expected: those pages describe the shipped server, the ten tools, the cards, and the chip order
- Actual: the README still says the host UI arrives in a later chunk, the transport arrives later, Playwright lands later, and the demo script is not filled in. `docs/architecture.md` and `docs/spec-notes.md` are still skeleton stubs. The simulator, the Streamable HTTP transport, and `npm run test:e2e` are already in the tree.
- Severity: Low
- Time lost: a few minutes checking `BUILD.txt` and `apps/simulator/src/planner.ts` for the chip order
- Workaround: use `BUILD.txt` and the `QUICK_CHIPS` list
- Suggestion: replace the skeleton paragraphs in the README and those two docs with the shipped ports, the chip order, and the protocol version
- Evidence: those three files at commit `dc1572a`
- Product feedback: repository docs

## FL-06

- Timestamp: 2026-10-22 12:31
- Tool and version: DashScope TTS, model `qwen3-tts-flash`, voice Cherry. The secret file was checked before any synthesis call.
- Task: narrate `docs/video-script.md`
- Steps: read `/etc/grok-secrets/dashscope.env` for `DASHSCOPE_API_KEY`. The brief says that file holds the key.
- Expected: the file is readable and contains the key, with no need to copy it into the repo
- Actual: `/etc/grok-secrets/` does not exist. `sudo -n ls /etc/grok-secrets` asks for a password. This user cannot create `/etc/grok-secrets`. A search of `/etc`, `/opt`, `/run`, `/var`, `/tmp`, `/workspace`, and the home directories found no non-empty `DASHSCOPE_API_KEY`. The narrate script stops there. It does not switch to another voice engine.
- Severity: High
- Time lost: the narration step cannot start until the file is present
- Workaround: none that still uses DashScope from the documented path
- Suggestion: install `/etc/grok-secrets/dashscope.env` as a group-readable file for `grokproj` before the video step, and keep the key out of git
- Evidence: shell `ls` of `/etc/grok-secrets/` on 2026-10-22 12:31, exit "No such file or directory"
- Product feedback: DashScope TTS
