/**
 * Record the simulator page at 1920x1080.
 * The viewport is the picture. No browser chrome and no OS chrome.
 * Shot lengths come from docs/video-script.md.
 */

import { spawn } from "node:child_process";
import { mkdirSync, openSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { loadCues } from "./video-script.mjs";

const OUT = "/tmp/hk-video";
const ROOT = resolve(import.meta.dirname, "..");
const DB = resolve(ROOT, "data/demo-video.db");
const MCP = "http://127.0.0.1:8787";
const SIM = "http://127.0.0.1:5173";

const serverEnv = {
  ...process.env,
  HK_HOST: "127.0.0.1",
  HK_PORT: "8787",
  HK_DB: DB,
  HK_SIM_MODE: "1",
  HK_SIM_START: "2026-10-21T09:00:00-07:00",
  HK_PURCHASE_CODE: "2468",
  HK_ALLOWED_ORIGINS: "http://localhost:5173,http://127.0.0.1:5173",
  HK_JSON_RESPONSE: "0",
  HK_AUTH_TOKEN: "",
  HK_LLM_BASE_URL: "",
  HK_LLM_API_KEY: "",
  HK_LLM_MODEL: "",
  DASHSCOPE_API_KEY: "",
};

function launch(bin, args, cwd, logName) {
  mkdirSync(OUT, { recursive: true });
  const log = openSync(resolve(OUT, logName), "w");
  const child = spawn(bin, args, {
    cwd,
    env: serverEnv,
    detached: true,
    stdio: ["ignore", log, log],
  });
  child.unref();
  if (child.pid === undefined) throw new Error(`Could not start ${bin}`);
  return child.pid;
}

function stopPid(pid) {
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* already stopped */
    }
  }
}

async function reachable(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForOk(url) {
  const started = Date.now();
  while (Date.now() - started < 30000) {
    if (await reachable(url)) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function card(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    html, body { margin: 0; height: 100%; background: #e7dfd2; color: #1c1917; font-family: "Segoe UI", sans-serif; }
    main { box-sizing: border-box; min-height: 100%; padding: 72px 88px 160px; }
    p.kicker { letter-spacing: 0.14em; text-transform: uppercase; font-size: 22px; color: #143d2c; margin: 0 0 18px; }
    h1 { font-size: 84px; line-height: 1; margin: 0 0 24px; font-weight: 650; }
    p.lead { font-size: 32px; max-width: 1400px; line-height: 1.35; margin: 0; }
    .row { display: flex; gap: 28px; align-items: stretch; margin-top: 48px; }
    .box { flex: 1; background: #fffdf8; border: 3px solid #143d2c; border-radius: 18px; padding: 28px; font-size: 28px; line-height: 1.35; }
    .arrow { align-self: center; font-size: 42px; color: #143d2c; }
    .fine { margin-top: 36px; font-size: 24px; color: #44403c; }
  </style>
</head>
<body><main>${body}</main></body>
</html>`;
}

async function waitForTurn(page, before) {
  await page.waitForFunction((prev) => {
    const transcript = document.querySelector(".transcript");
    const input = document.querySelector("#say");
    if (!(input instanceof HTMLInputElement) || input.disabled) return false;
    return Boolean(transcript && transcript.innerText !== prev);
  }, before, { timeout: 20000 });
}

async function clickChip(page, name) {
  const before = await page.locator(".transcript").innerText();
  await page.getByRole("button", { name, exact: true }).click();
  await waitForTurn(page, before);
}

async function sayLine(page, text) {
  const before = await page.locator(".transcript").innerText();
  await page.locator("#say").fill(text);
  await page.getByRole("button", { name: "Send" }).click();
  await waitForTurn(page, before);
}

async function main() {
  const cues = loadCues();
  const endAt = Object.fromEntries(cues.map((cue) => [cue.id, cue.end * 1000]));
  mkdirSync(OUT, { recursive: true });
  rmSync(DB, { force: true });
  rmSync(`${DB}-wal`, { force: true });
  rmSync(`${DB}-shm`, { force: true });

  const mcpUp = await reachable(`${MCP}/healthz`);
  const simUp = await reachable(SIM);
  if (mcpUp !== simUp) throw new Error("8787 and 5173 must both be up, or both be free");
  let mcpPid = 0;
  let simPid = 0;
  let browser;
  let context;
  let page;
  try {
  if (!mcpUp) {
    mcpPid = launch(resolve(ROOT, "node_modules/.bin/tsx"), ["apps/mcp-server/src/index.ts"], ROOT, "mcp.log");
    simPid = launch(
      resolve(ROOT, "node_modules/.bin/vite"),
      ["--host", "127.0.0.1", "--port", "5173", "--strictPort"],
      resolve(ROOT, "apps/simulator"),
      "sim.log",
    );
    await waitForOk(`${MCP}/healthz`);
    await waitForOk(SIM);
  }
  const reset = await fetch(`${MCP}/sim/reset`, { method: "POST", headers: { origin: "http://127.0.0.1:5173" } });
  if (!reset.ok) throw new Error(`sim reset failed: HTTP ${reset.status}`);

    browser = await chromium.launch({
      channel: "chrome",
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      screen: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
      colorScheme: "light",
      recordVideo: { dir: OUT, size: { width: 1920, height: 1080 } },
    });
    page = await context.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });
    const started = Date.now();
    const holdUntil = async (ms) => {
      const left = ms - (Date.now() - started);
      if (left > 40) await page.waitForTimeout(left);
      else console.log(`drift ${Math.round(Date.now() - started - ms)}ms past ${ms}`);
    };
    const pause = async (ms, deadline) => {
      const spare = deadline - (Date.now() - started);
      const wait = Math.min(ms, Math.max(0, spare - 2500));
      if (wait > 40) await page.waitForTimeout(wait);
    };
    await page.setContent(
      card(
        "Hearthkeep",
        `<p class="kicker">Alexa+ track · Simulation</p>
         <h1>Hearthkeep</h1>
         <p class="lead">A household upkeep agent. Filters, batteries, vents, and the person you call when a vent needs a pro.</p>
         <p class="fine">Fictional sample data. Simulated Alexa+ experience. Not a real device.</p>`,
      ),
    );
    await holdUntil(endAt.L1);

    await page.setContent(
      card(
        "Architecture",
        `<p class="kicker">Runtime</p>
         <h1>Two processes</h1>
         <div class="row">
           <div class="box"><strong>Simulator</strong><br />127.0.0.1:5173<br />Simulated Alexa+ host</div>
           <div class="arrow">→</div>
           <div class="box"><strong>MCP server</strong><br />127.0.0.1:8787<br />2025-11-25 · Streamable HTTP</div>
           <div class="arrow">→</div>
           <div class="box"><strong>Rules + SQLite</strong><br />Fictional seed<br />Mock purchase code</div>
         </div>
         <p class="fine">The host does not buy from a retailer. Every lookup and action in the demo is a tool call on the local server.</p>`,
      ),
    );
    await holdUntil(endAt.L2);

    await page.goto(SIM, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Start" }).click();
    await page.locator(".transcript .assistant").last().waitFor({ timeout: 15000 });
    await holdUntil(endAt.L3);

    await clickChip(page, "Order a new filter for the fridge");
    await pause(5000, endAt.L4);
    await clickChip(page, "Yes, the CX-28");
    await pause(5000, endAt.L4);
    await clickChip(page, "Say purchase code (demo)");
    await pause(4000, endAt.L4);
    await page.getByRole("button", { name: "Trace", exact: true }).click();
    await page.getByRole("complementary", { name: "Trace" }).waitFor();
    await holdUntil(endAt.L4);

    await page.getByRole("button", { name: "Trace", exact: true }).click();
    await clickChip(page, "The hallway smoke alarm keeps chirping");
    await pause(6000, endAt.L5);
    await clickChip(page, "Done, I swapped it");
    const afterDone = await page.locator(".transcript .assistant").last().innerText();
    if (/which one/i.test(afterDone)) {
      console.log("naming the hallway battery after the task question");
      await sayLine(page, "the hallway smoke alarm battery");
    }
    await holdUntil(endAt.L5);

    await clickChip(page, "Book someone to clean the dryer vent next week");
    await pause(5000, endAt.L6);
    await clickChip(page, "Tuesday morning");
    await pause(5000, endAt.L6);
    await clickChip(page, "Approve with code (demo)");
    await holdUntil(endAt.L6);

    const beforeMorning = await page.locator(".transcript").innerText();
    await page.getByRole("button", { name: "Next morning" }).click();
    await page.waitForFunction((prev) => {
      const transcript = document.querySelector(".transcript");
      const input = document.querySelector("#say");
      if (!(input instanceof HTMLInputElement) || input.disabled) return false;
      return Boolean(transcript && transcript.innerText !== prev && transcript.innerText.length > 0);
    }, beforeMorning, { timeout: 20000 });
    await pause(4000, endAt.L7 - 5000);
    await clickChip(page, "I smell gas in the kitchen");
    await page.getByRole("alert").waitFor({ timeout: 10000 });
    await holdUntil(endAt.L7);

    await page.getByRole("button", { name: "Trace", exact: true }).click();
    await page.getByRole("complementary", { name: "Trace" }).getByRole("button", { name: "Raw JSON" }).last().click();
    await page.locator("pre, code").last().waitFor({ timeout: 5000 }).catch(() => {});
    await pause(5000, endAt.L8 - 1000);
    await page.setContent(
      card(
        "Tests and license",
        `<p class="kicker">Open source</p>
         <h1>MIT</h1>
         <p class="lead">Copyright 2026 Psyche.</p>
         <p class="lead">Protocol checks: <code>npm test</code>. Chrome flows: <code>npm run test:e2e</code>.</p>
         <p class="fine">The trace on the previous shot is the raw tool result from this session. The purchase code is redacted there.</p>`,
      ),
    );
    await holdUntil(endAt.L8);

    await page.setContent(
      card(
        "Close",
        `<p class="kicker">Hearthkeep</p>
         <h1>See the repository</h1>
         <p class="lead">https://github.com/HONGKONGBALL/hearthkeep</p>
         <p class="fine">Fictional sample data. Simulated Alexa+ experience.</p>`,
      ),
    );
    await holdUntil(endAt.L9);
  } finally {
    const video = page ? page.video() : null;
    if (context) await context.close();
    if (browser) await browser.close();
    if (video) {
      const recorded = await video.path();
      const target = resolve(OUT, "page.webm");
      if (recorded !== target) renameSync(recorded, target);
      console.log(target);
    }
    if (mcpPid) stopPid(mcpPid);
    if (simPid) stopPid(simPid);
    writeFileSync(resolve(OUT, "record-done.txt"), new Date().toISOString());
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
