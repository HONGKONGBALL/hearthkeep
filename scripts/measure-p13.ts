/**
 * P-13: three Chrome runs of cases 64, 65, 67, and 68.
 * Records utterance-to-rendered-reply time for each turn.
 * Household names, prices, and the purchase code are fictional sample data.
 *
 * Clock is performance.now() in the page.
 * Start is the click (capture) on Start or Send.
 * reply_ms ends when the new assistant text contains the expected snippet.
 * settled_ms ends when that reply is showing and #say is enabled again.
 * p95 uses the same nearest-rank rule as tests/protocol/qa-i.test.ts.
 */
import { writeFileSync } from "node:fs";
import { chromium, type Browser, type Page } from "@playwright/test";
import { MCP_URL, SIM_URL, resetSim, startMcp, startSim, stopPid, waitForOk } from "../tests/e2e/servers.ts";

/** Default stays the rc2 file. Set HK_P13_OUT to write a later candidate elsewhere. */
const OUT = process.env.HK_P13_OUT ?? "docs/evidence/rc2/perf.txt";
const RELEASE = process.env.HK_P13_RELEASE ?? "rc2";
const RUNS = 3;

interface TurnSpec {
  utterance: string;
  /** Lowercase snippet that identifies the new assistant reply. */
  snippet: string;
  /** Lowercase phrases the reply must contain. */
  phrases: string[];
  masked?: boolean;
}

interface Sample {
  caseId: number;
  run: number;
  turn: number;
  utterance: string;
  snippet: string;
  replyMs: number;
  settledMs: number;
  reply: string;
}

const CASES: Record<number, TurnSpec[]> = {
  64: [
    {
      utterance: "(Start) morning briefing",
      snippet: "dryer vent",
      phrases: ["dryer vent", "overdue", "fridge water filter", "due today"],
    },
  ],
  65: [
    {
      utterance: "Order a new filter for the fridge",
      snippet: "rillstone cx-28",
      phrases: ["ferngate fg-28", "rillstone cx-28", "$24.99", "friday"],
    },
    {
      utterance: "Yes, the CX-28",
      snippet: "purchase code",
      phrases: ["$24.99", "october 23", "purchase code"],
    },
    {
      utterance: "2468",
      snippet: "ordered",
      phrases: ["ordered"],
      masked: true,
    },
  ],
  67: [
    {
      utterance: "The hallway smoke alarm keeps chirping",
      snippet: "nothing to buy",
      phrases: ["low battery", "two 9-volt", "garage shelf", "nothing to buy"],
    },
    {
      utterance: "Done, I swapped it",
      snippet: "one 9-volt left",
      phrases: ["one 9-volt left", "october 2027"],
    },
  ],
  68: [
    {
      utterance: "Book someone to clean the dryer vent next week",
      snippet: "openings next week",
      phrases: ["openings next week", "tuesday", "$89"],
    },
    {
      utterance: "Tuesday morning",
      snippet: "over your $60",
      phrases: ["$29", "over your $60", "approve"],
    },
    {
      utterance: "2468",
      snippet: "that's over your limit",
      phrases: ["that's over your limit", "approve"],
      masked: true,
    },
    {
      utterance: "Approve 2468",
      snippet: "booked for",
      phrases: ["booked for"],
      masked: true,
    },
  ],
};

function percentile95(samples: number[]): number {
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.ceil(0.95 * sorted.length) - 1;
  return sorted[Math.max(0, index)] ?? 0;
}

function roundMs(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Playwright serializes the function passed into the page. A body built with
 * new Function stays free of the TypeScript helper the browser does not have.
 */
function inPage(body: string): () => unknown {
  return new Function(body) as () => unknown;
}

function inPageArg(body: string): (arg: string) => unknown {
  return new Function("arg", body) as (arg: string) => unknown;
}

async function arm(page: Page): Promise<void> {
  await page.evaluate(
    inPage(`
      var nodes = document.querySelectorAll(".transcript .assistant");
      var last = nodes[nodes.length - 1];
      var state = {
        start: 0,
        replyAt: 0,
        settledAt: 0,
        base: last ? (last.textContent || "") : "",
        replyText: ""
      };
      var root = document.querySelector(".transcript");
      if (window.__hkObs) window.__hkObs.disconnect();
      var obs = new MutationObserver(function () {
        var list = document.querySelectorAll(".transcript .assistant");
        var node = list[list.length - 1];
        var text = node ? (node.textContent || "") : "";
        if (state.replyAt === 0 && text !== "" && text !== state.base) {
          state.replyAt = performance.now();
          state.replyText = text;
        }
      });
      window.__hk = state;
      window.__hkObs = obs;
      if (root) obs.observe(root, { childList: true, subtree: true, characterData: true });
    `),
  );
}

async function markClick(page: Page, selector: string): Promise<void> {
  const armed = await page.evaluate(
    inPageArg(`
      var button = document.querySelector(arg);
      if (!button) return false;
      button.addEventListener("click", function () {
        window.__hk.start = performance.now();
      }, { capture: true, once: true });
      return true;
    `),
    selector,
  );
  if (!armed) throw new Error(`missing click target ${selector}`);
}

async function readSample(page: Page, snippet: string): Promise<{ replyMs: number; settledMs: number; reply: string }> {
  try {
    await page.waitForFunction(
      inPageArg(`
        var state = window.__hk;
        var say = document.querySelector("#say");
        var enabled = say instanceof HTMLInputElement && !say.disabled;
        var text = (state.replyText || "").toLowerCase();
        if (state.start > 0 && state.replyAt > 0 && text.indexOf(arg) !== -1 && enabled && state.settledAt === 0) {
          state.settledAt = performance.now();
        }
        return state.settledAt > 0;
      `),
      snippet,
      { timeout: 20000 },
    );
  } catch (error) {
    const seen = await page.evaluate(
      inPage(`
        var list = document.querySelectorAll(".transcript .assistant");
        var node = list[list.length - 1];
        return {
          start: window.__hk ? window.__hk.start : 0,
          replyAt: window.__hk ? window.__hk.replyAt : 0,
          replyText: window.__hk ? window.__hk.replyText : "",
          visible: node ? (node.textContent || "") : ""
        };
      `),
    );
    throw new Error(`timed out waiting for ${JSON.stringify(snippet)}: ${JSON.stringify(seen)}`, { cause: error });
  }
  return page.evaluate(
    inPage(`
      var state = window.__hk;
      return {
        replyMs: state.replyAt - state.start,
        settledMs: state.settledAt - state.start,
        reply: state.replyText
      };
    `),
  ) as Promise<{ replyMs: number; settledMs: number; reply: string }>;
}

async function openFresh(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Start" }).waitFor({ state: "visible" });
}

async function timeStart(page: Page, spec: TurnSpec): Promise<{ replyMs: number; settledMs: number; reply: string }> {
  await arm(page);
  await markClick(page, "button.start");
  await page.getByRole("button", { name: "Start" }).click();
  return readSample(page, spec.snippet);
}

async function timeSend(page: Page, spec: TurnSpec): Promise<{ replyMs: number; settledMs: number; reply: string }> {
  const input = page.locator("#say");
  await input.waitFor({ state: "visible" });
  if (await input.isDisabled()) {
    await page.waitForFunction(
      inPage(`
        var say = document.querySelector("#say");
        return say instanceof HTMLInputElement && !say.disabled;
      `),
    );
  }
  await input.fill(spec.utterance);
  await arm(page);
  await markClick(page, "form button[type=submit]");
  await page.locator("form button[type=submit]").click();
  const sample = await readSample(page, spec.snippet);
  if (spec.masked) {
    const shown = await page.locator(".transcript .user").last().innerText();
    if (shown !== "••••") throw new Error(`purchase code was not masked, saw ${JSON.stringify(shown)}`);
  }
  return sample;
}

function assertPhrases(reply: string, spec: TurnSpec): void {
  const lower = reply.toLowerCase();
  const missing = spec.phrases.filter((phrase) => !lower.includes(phrase));
  if (missing.length > 0) {
    throw new Error(`reply missing ${missing.join(", ")}: ${reply}`);
  }
}

async function runCase(page: Page, caseId: number, run: number): Promise<Sample[]> {
  await resetSim();
  await openFresh(page);
  const turns = CASES[caseId];
  if (!turns) throw new Error(`unknown case ${caseId}`);
  const samples: Sample[] = [];
  if (caseId === 64) {
    const timed = await timeStart(page, turns[0]);
    assertPhrases(timed.reply, turns[0]);
    samples.push({ caseId, run, turn: 1, utterance: turns[0].utterance, snippet: turns[0].snippet, ...timed });
    return samples;
  }
  await page.getByRole("button", { name: "Start" }).click();
  await page.locator(".transcript .assistant").last().waitFor({ state: "visible" });
  await page.waitForFunction(
    inPage(`
      var list = document.querySelectorAll(".transcript .assistant");
      var last = list[list.length - 1];
      var say = document.querySelector("#say");
      var text = (last ? last.textContent || "" : "").toLowerCase();
      return text.indexOf("dryer vent") !== -1 && say instanceof HTMLInputElement && !say.disabled;
    `),
  );
  for (let index = 0; index < turns.length; index += 1) {
    const spec = turns[index];
    const timed = await timeSend(page, spec);
    assertPhrases(timed.reply, spec);
    samples.push({
      caseId,
      run,
      turn: index + 1,
      utterance: spec.utterance,
      snippet: spec.snippet,
      replyMs: timed.replyMs,
      settledMs: timed.settledMs,
      reply: timed.reply,
    });
  }
  return samples;
}

function render(samples: Sample[], meta: { startedAt: string; finishedAt: string; head: string }): string {
  const reply = samples.map((sample) => sample.replyMs);
  const settled = samples.map((sample) => sample.settledMs);
  const p95Reply = percentile95(reply);
  const p95Settled = percentile95(settled);
  const lines: string[] = [];
  lines.push("P-13 per-turn timings for cases 64, 65, 67, and 68");
  lines.push(`Release candidate: ${RELEASE}`);
  lines.push("Household names, prices, and the purchase code in these turns are fictional sample data.");
  lines.push("");
  lines.push("Method");
  lines.push("  Browser: Chrome via Playwright, viewport 1280x800, origin http://127.0.0.1:5173.");
  lines.push("  Server: MCP on 127.0.0.1:8787, HK_SIM_MODE=1, HK_SIM_START=2026-10-21T09:00:00-07:00, HK_JSON_RESPONSE=0 (SSE).");
  lines.push("  HK_PURCHASE_CODE=2468, the fictional demo code. HK_AUTH_TOKEN and HK_LLM_* are empty.");
  lines.push("  Each case runs 3 times. The simulator is reset and the browser context is new before every case run.");
  lines.push("  Clock: performance.now() in the page.");
  lines.push("  Start: click event, capture phase, on Start (case 64) or Send (typed turns). Filling the field is not included.");
  lines.push("  reply_ms: start until the new .transcript .assistant text contains the snippet.");
  lines.push("  settled_ms: start until that reply is showing and #say is enabled. Card rendering is inside this interval.");
  lines.push("  p95: nearest rank. Sort ascending, index = ceil(0.95 * n) - 1. Same rule as tests/protocol/qa-i.test.ts.");
  lines.push("  Acceptance uses reply_ms. Threshold is 1500 ms.");
  lines.push(`  git HEAD at the run: ${meta.head}`);
  lines.push(`  started_at: ${meta.startedAt}`);
  lines.push(`  finished_at: ${meta.finishedAt}`);
  lines.push("");
  lines.push("Samples");
  lines.push("case\trun\tturn\tutterance\tsnippet\treply_ms\tsettled_ms");
  for (const sample of samples) {
    lines.push(
      [
        sample.caseId,
        sample.run,
        sample.turn,
        sample.utterance,
        sample.snippet,
        roundMs(sample.replyMs).toFixed(3),
        roundMs(sample.settledMs).toFixed(3),
      ].join("\t"),
    );
  }
  lines.push("");
  lines.push("Replies");
  for (const sample of samples) {
    lines.push(`#${sample.caseId} run ${sample.run} turn ${sample.turn}: ${sample.reply.replace(/\s+/g, " ").trim()}`);
  }
  lines.push("");
  lines.push("Summary");
  lines.push(`n=${samples.length}`);
  lines.push(`reply_ms min=${roundMs(Math.min(...reply)).toFixed(3)} max=${roundMs(Math.max(...reply)).toFixed(3)} p95=${roundMs(p95Reply).toFixed(3)}`);
  lines.push(`settled_ms min=${roundMs(Math.min(...settled)).toFixed(3)} max=${roundMs(Math.max(...settled)).toFixed(3)} p95=${roundMs(p95Settled).toFixed(3)}`);
  for (const caseId of [64, 65, 67, 68]) {
    const group = samples.filter((sample) => sample.caseId === caseId).map((sample) => sample.replyMs);
    lines.push(`case ${caseId} n=${group.length} reply_ms p95=${roundMs(percentile95(group)).toFixed(3)}`);
  }
  const pass = p95Reply < 1500 && p95Settled < 1500;
  lines.push(`p95 reply_ms < 1500 ms: ${p95Reply < 1500 ? "PASS" : "FAIL"} (${roundMs(p95Reply).toFixed(3)} ms)`);
  lines.push(`p95 settled_ms < 1500 ms: ${p95Settled < 1500 ? "PASS" : "FAIL"} (${roundMs(p95Settled).toFixed(3)} ms)`);
  lines.push(`verdict: ${pass ? "PASS" : "FAIL"}`);
  lines.push("");
  return lines.join("\n");
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const mcp = startMcp();
  const sim = startSim();
  let browser: Browser | null = null;
  try {
    await waitForOk(`${MCP_URL}/healthz`);
    await waitForOk(SIM_URL);
    await fetch(`${SIM_URL}/`);
    await fetch(`${SIM_URL}/src/main.tsx`);
    await fetch(`${SIM_URL}/src/App.tsx`);
    await resetSim();
    browser = await chromium.launch({
      channel: "chrome",
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    const samples: Sample[] = [];
    for (let run = 1; run <= RUNS; run += 1) {
      for (const caseId of [64, 65, 67, 68]) {
        const context = await browser.newContext({
          baseURL: SIM_URL,
          viewport: { width: 1280, height: 800 },
        });
        const page = await context.newPage();
        try {
          const batch = await runCase(page, caseId, run);
          samples.push(...batch);
          process.stdout.write(`run ${run} case ${caseId}: ${batch.map((item) => item.replyMs.toFixed(1)).join(", ")} ms\n`);
        } finally {
          await context.close();
        }
      }
    }
    const head = process.env.HK_MEASURE_HEAD ?? "unknown";
    const text = render(samples, { startedAt, finishedAt: new Date().toISOString(), head });
    writeFileSync(OUT, text);
    if (!text.includes("verdict: PASS")) {
      process.stderr.write(text);
      throw new Error("p95 is not under 1500 ms");
    }
    process.stdout.write(text);
  } finally {
    await browser?.close();
    stopPid(mcp);
    stopPid(sim);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
