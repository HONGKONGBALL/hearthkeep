# Product feedback

Dated from the chunk notes, commits, and checks in this workspace. Versions are the ones installed in `package-lock.json` on 2026-10-22 unless a commit says otherwise. Sample household data is fictional.

## Alexa+ simulated-experience path

- Notes: 2026-10-22. The hackathon brief is the track rule used here. No Alexa+ device, account, or live attach was available. `BUILD.txt` records the simulator ribbon and the local MCP server.
- Tools used: the simulated-experience path in the brief. The web app is the host. It is not the Alexa app.
- What worked: the brief allows a browser simulation plus a self-hosted MCP server. The shipped host talks to `http://127.0.0.1:8787/mcp` and shows the ribbon `SIMULATION — not a real Alexa+ device`.
- What needs work: this workspace has no device-free console that attaches a self-hosted server, because that attach was never attempted. See `docs/feature-requests.md`.
- Onboarding: the brief was enough to pick the simulated path. Live Alexa+ onboarding was not exercised.
- Would build again: Yes. The simulated path runs on this machine with no Alexa account.

## MCP 2025-11-25, Streamable HTTP

- Notes: 2026-10-21 transport commit, 2026-10-21 23:49 card-resource fix (`59ae867`, FL-03), protocol cases in `BUILD.txt` items 7–57. Both SSE and JSON response modes were exercised (`HK_JSON_RESPONSE`).
- Tools used: a local Express server in `apps/mcp-server`, protocol version `2025-11-25`. npm packages `@modelcontextprotocol/sdk` and `@modelcontextprotocol/ext-apps` are not in `package-lock.json`.
- What worked: initialize negotiates `2025-11-25`. Sessions use `Mcp-Session-Id`. `GET /mcp` returns 405. `DELETE /mcp` ends the session. Origin allowlist and the Accept, Content-Type, and protocol-version checks are covered by `tests/protocol`. Ten P0 tools return text plus `structuredContent`. Domain failures are tool results with `isError: true`.
- What needs work: sessions live in the process that created them. A restart drops them (`CHUNK2b1.txt`). FL-03: initialize originally omitted the card resources.
- Onboarding: the behavior we needed is encoded in `tests/protocol` rather than copied from an SDK sample.
- Would build again: Yes. The protocol tests describe the headers and the session rules this server has to keep.

## MCP TypeScript SDK

- Notes: 2026-10-22. `package-lock.json` has no `@modelcontextprotocol/sdk`.
- Tools used: none. Tool schemas use zod 4.6.7. HTTP uses Express 4.22.3.
- What worked: nothing to report from the SDK. The local server passed the protocol suite without it.
- What needs work: this entry cannot rate SDK samples, types, or stream handling, because they were not imported.
- Onboarding: not started.
- Would build again: No. The tool list is fixed and the protocol tests already pass on the local transport.

## MCP Apps

- Notes: 2026-10-22. Five UI resources are served by the MCP server (`59ae867`, FL-03). Cards render in sandboxed frames. `BUILD.txt` item 62 records that those frames made no requests during F1–F4.
- Tools used: local HTML card templates. `@modelcontextprotocol/ext-apps` is not installed.
- What worked: the simulator hosts status, options, checkout, receipt, and task cards. The purchase code is not required for the card to render. Frame requests stayed empty in the Chrome case cited above.
- What needs work: this does not exercise a published MCP Apps host-bridge sample, because that package is not a dependency.
- Onboarding: the card URIs are registered on the server. There was no separate MCP Apps tutorial in this repo.
- Would build again: Yes. Self-contained cards let the simulated host show choices without a remote app host.

## Agent Skills

- Notes: 2026-10-22. `skills/home-upkeep/README.md` says the file is a placeholder and is not part of the default install. No `apps/` or `packages/` source references `skills/`.
- Tools used: none at runtime. The demo planner is `apps/simulator/src/planner.ts` (deterministic, offline).
- What worked: the default demo does not need the skill file.
- What needs work: the placeholder does not tell a model when to call tools. Nothing in the running host loads it.
- Onboarding: not started.
- Would build again: No. The offline planner already produces the demo turns, so an unloaded skill package would not change them.

## Playwright

- Notes: 2026-10-22. `@playwright/test` 1.64.1, Chrome channel, viewport 1280×800 in `playwright.config.ts`. `BUILD.txt` records 18 Chrome tests passing. FL-04, commit `dc1572a`.
- Tools used: Playwright test runner and Chrome, for `npm run test:e2e` and for `scripts/record-demo.mjs`.
- What worked: one worker, serial, against the local simulator. The video script records the viewport only, at 1920×1080, with the same Chrome channel and the sandbox flags from the config.
- What needs work: FL-04, the acceptance user could not append to sticky `/tmp` server logs.
- Onboarding: `npm run test:e2e` is the command. Chrome has to be installed for the `chrome` channel.
- Would build again: Yes. The same runner drives the flows the video has to show.

## Vitest

- Notes: FL-01 on 2026-10-22 11:44:46. FL-02, commit `1506a05`, Vitest 4.1.12. `BUILD.txt` records 15 files and 194 tests passing.
- Tools used: Vitest 4.1.12 via `npm test`.
- What worked: protocol, storage, and health tests run without an API key. JSON and SSE modes are both in the protocol files.
- What needs work: FL-01, a server already bound to 8787 failed I84 until it was stopped. FL-02, Vitest 3.x pulled advisory-affected `tinypool` and `@vitest/mocker`.
- Onboarding: `npm test` is the command. No browser is required for that suite.
- Would build again: Yes. After the 4.1.12 pin, `npm test` is the check this repo uses before a demo.

## Grok Build

- Notes: 2026-10-20 through 2026-10-22. The git history on this machine was produced with Grok Build. This feedback pass used the same workspace.
- Tools used: the coding CLI in this Ubuntu session. No model key is stored in the repo.
- What worked: the server, the simulator, and the test suites were already in the tree and matched `BUILD.txt`.
- What needs work: FL-06, the narration key file the brief points at was not on the machine, so the CLI could not finish the spoken track from the documented path.
- Onboarding: the CLI was already signed in for this session. Repo setup is `npm ci`, then `npm run demo`.
- Would build again: Yes. The product runs locally once the dependencies are installed, without a paid model key.

## DashScope TTS

- Notes: FL-06, checked 2026-10-22 12:31 and again at 12:46. Model required by the video plan: `qwen3-tts-flash`, voice Cherry, English. `node scripts/narrate-demo.mjs` exited 1 with ENOENT for the secret file. No synthesis request was sent.
- Tools used: `scripts/narrate-demo.mjs`. It reads `DASHSCOPE_API_KEY` from the environment first (falling back to a local secrets file when the variable is unset) and posts to the DashScope multimodal generation endpoint. No other speech engine is coded there.
- What worked: not yet. The script has not received a key from that file, so no synthesis call has succeeded in this workspace.
- What needs work: FL-06, the secret file is missing and this user cannot create it under `/etc`.
- Onboarding: the brief names the file and the variable. The script fails closed when the file is absent, and it does not print a key.
- Would build again: Yes, once that file is readable. The narration is one JSON request per line and is not required to run the product.
