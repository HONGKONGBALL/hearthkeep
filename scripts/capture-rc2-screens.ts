/**
 * Capture the required rc2 frames listed in docs/screens/rc2/README.md.
 * Household names, prices, and the purchase code are fictional sample data.
 * Run: npx tsx scripts/capture-rc2-screens.ts
 */
import { rmSync } from "node:fs";
import { chromium, type Page } from "@playwright/test";
import {
  DB_FILE,
  MCP_URL,
  SIM_URL,
  readPids,
  resetSim,
  startMcp,
  startSim,
  stopPid,
  waitForDown,
  waitForOk,
  writePids,
} from "../tests/e2e/servers.ts";

const OUT = "docs/screens/rc2";

async function shot(page: Page, file: string): Promise<void> {
  await page.screenshot({ path: `${OUT}/${file}`, animations: "disabled" });
}

async function settled(page: Page): Promise<boolean> {
  const input = page.locator("#say");
  const down = await page.getByRole("alert").filter({ hasText: "Can't reach the home server" }).count();
  return (await input.isEnabled()) || down > 0;
}

async function send(page: Page, utterance: string): Promise<void> {
  const input = page.locator("#say");
  await input.waitFor({ state: "visible" });
  const started = Date.now();
  while (!(await input.isEnabled())) {
    if (Date.now() - started > 20000) throw new Error(`say field stayed disabled before: ${utterance}`);
    await page.waitForTimeout(100);
  }
  const before = await page.locator(".transcript").innerText();
  await input.fill(utterance);
  await page.getByRole("button", { name: "Send" }).click();
  const waitStart = Date.now();
  while (Date.now() - waitStart < 20000) {
    if (await settled(page)) {
      const text = await page.locator(".transcript").innerText();
      if (text !== before) return;
    }
    await page.waitForTimeout(100);
  }
  throw new Error(`turn did not finish: ${utterance}`);
}

async function waitBriefing(page: Page): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < 20000) {
    const text = await page.locator(".transcript .assistant").last().innerText().catch(() => "");
    if (/dryer vent/i.test(text)) return;
    await page.waitForTimeout(100);
  }
  throw new Error("briefing did not appear");
}

async function openWelcome(page: Page): Promise<void> {
  await page.goto(`${SIM_URL}/`);
  await page.evaluate(() => localStorage.removeItem("hearthkeep.welcome.dismissed"));
  await resetSim();
  await page.reload();
  await page.getByRole("button", { name: "Start" }).waitFor();
}

async function startSession(page: Page): Promise<void> {
  await openWelcome(page);
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await waitBriefing(page);
}

async function main(): Promise<void> {
  rmSync(DB_FILE, { force: true });
  rmSync(`${DB_FILE}-wal`, { force: true });
  rmSync(`${DB_FILE}-shm`, { force: true });
  const mcp = startMcp();
  const sim = startSim();
  writePids({ mcp, sim });
  await waitForOk(`${MCP_URL}/healthz`);
  await waitForOk(SIM_URL);
  await resetSim();

  const browser = await chromium.launch({
    channel: "chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await openWelcome(page);
    const ribbon = page.locator(".ribbon");
    if ((await ribbon.count()) === 0) throw new Error("simulation ribbon is missing on welcome");
    await shot(page, "s0-welcome.png");

    await page.getByRole("button", { name: "Start" }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await waitBriefing(page);
    await page.locator("iframe.card-frame").waitFor();
    await shot(page, "s1-briefing.png");
    await shot(page, "c1-status-card.png");

    await page.getByRole("button", { name: "Reset demo" }).click();
    await waitBriefing(page);
    await send(page, "Order a new filter for the fridge");
    await page.frameLocator("iframe.card-frame").locator("[data-tile]").first().waitFor();
    await shot(page, "c2-options-carousel.png");

    await send(page, "Yes, the CX-28");
    await page.frameLocator("iframe.card-frame").locator("body").getByText("Within your $60 limit").waitFor();
    await shot(page, "c3-checkout-card.png");

    await send(page, "2468");
    await page.frameLocator("iframe.card-frame").locator("body").getByText("ord_0001").waitFor();
    const receiptText = await page.locator("body").innerText();
    if (receiptText.includes("2468")) throw new Error("purchase code 2468 is visible after confirm");
    await shot(page, "c4-receipt-card.png");

    await page.getByRole("button", { name: "Trace", exact: true }).click();
    const trace = page.getByRole("complementary", { name: "Trace" });
    await trace.waitFor();
    const row = trace.locator("li", { hasText: "confirm_purchase" });
    await row.getByRole("button", { name: "Raw JSON" }).click();
    const raw = await row.locator("pre").innerText();
    if (!raw.includes("••••")) throw new Error("trace raw JSON does not redact the purchase code");
    if (raw.includes("2468") || (await trace.innerText()).includes("2468")) {
      throw new Error("trace shows the purchase code");
    }
    await shot(page, "trace.png");
    await page.getByRole("button", { name: "Trace", exact: true }).click();

    await page.getByRole("button", { name: "Data", exact: true }).click();
    const data = page.getByRole("complementary", { name: "Data" });
    await data.getByText("All data is fictional sample data").waitFor();
    await shot(page, "data.png");
    await page.getByRole("button", { name: "Data", exact: true }).click();

    await page.getByRole("button", { name: "About" }).click();
    const about = page.getByRole("dialog", { name: "About this simulation" });
    await about.locator("#about-license").waitFor();
    const license = await about.locator("#about-license").innerText();
    if (license !== "License: MIT") throw new Error(`about license line is ${license}`);
    await shot(page, "about.png");
    await about.getByRole("button", { name: "Close" }).click();

    await page.getByRole("button", { name: "Reset demo" }).click();
    await waitBriefing(page);
    await page.frameLocator("iframe.card-frame").getByRole("button", { name: "Replace battery, Hallway smoke alarm battery" }).click();
    await page.frameLocator("iframe.card-frame").getByRole("button", { name: "Mark done, Swap hallway smoke alarm battery" }).waitFor();
    await shot(page, "c5-task-card.png");

    await page.getByRole("button", { name: "Reset demo" }).click();
    await waitBriefing(page);
    await send(page, "I smell gas in the kitchen");
    await page.locator("p.alert").waitFor();
    const alertText = await page.locator("p.alert").innerText();
    if (!/leave/i.test(alertText)) throw new Error(`hazard alert text: ${alertText}`);
    await shot(page, "danger-alert.png");

    await page.setViewportSize({ width: 390, height: 800 });
    await page.getByRole("button", { name: "Reset demo" }).click();
    await waitBriefing(page);
    await page.locator(".ribbon").waitFor();
    await shot(page, "viewport-390.png");

    await page.setViewportSize({ width: 768, height: 800 });
    await shot(page, "viewport-768.png");

    await page.setViewportSize({ width: 1280, height: 800 });
    const pids = readPids();
    try {
      process.kill(-pids.mcp, "SIGTERM");
    } catch {
      process.kill(pids.mcp, "SIGTERM");
    }
    await waitForDown(`${MCP_URL}/healthz`);
    await send(page, "What needs doing?");
    await page.getByRole("alert").filter({ hasText: "Can't reach the home server" }).waitFor();
    await page.getByRole("button", { name: "Retry" }).waitFor();
    await shot(page, "offline-banner.png");
  } finally {
    await browser.close();
    try {
      const pids = readPids();
      stopPid(pids.mcp);
      stopPid(pids.sim);
    } catch {
      /* already stopped */
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  try {
    const pids = readPids();
    stopPid(pids.mcp);
    stopPid(pids.sim);
  } catch {
    /* setup failed before pids */
  }
  process.exit(1);
});
