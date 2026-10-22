/**
 * Shared browser helpers for QA F and G. Each test starts from a reset seed.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test as base, expect, type Frame, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { resetSim } from "./servers";

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

interface Monitor {
  cardRequests: string[];
  offHost: string[];
  pageErrors: string[];
}

export const test = base.extend<{ monitor: Monitor }>({
  monitor: [
    async ({ page }, use) => {
      const monitor: Monitor = { cardRequests: [], offHost: [], pageErrors: [] };
      page.on("request", (request) => {
        const url = request.url();
        try {
          const host = new URL(url).hostname;
          if (host !== "127.0.0.1" && host !== "localhost") monitor.offHost.push(url);
        } catch {
          /* ignore non-URL requests */
        }
        if (request.frame().parentFrame() !== null && !url.startsWith("about:")) monitor.cardRequests.push(url);
      });
      page.on("pageerror", (error) => {
        monitor.pageErrors.push(error.message);
      });
      await resetSim();
      await use(monitor);
      expect(monitor.offHost, `requests left the machine:\n${monitor.offHost.join("\n")}`).toEqual([]);
      expect(monitor.pageErrors, `uncaught page errors:\n${monitor.pageErrors.join("\n")}`).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export function card(page: Page) {
  return page.frameLocator("iframe.card-frame");
}

export function childFrame(page: Page): Frame {
  const frame = page.frames().find((entry) => entry.parentFrame() !== null);
  if (!frame) throw new Error("card frame is missing");
  return frame;
}

export async function openWelcome(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Start" })).toBeVisible();
}

export async function startSim(page: Page, replyTimeout = 15000): Promise<void> {
  await openWelcome(page);
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".transcript .assistant").last()).toContainText(/dryer vent/i, { timeout: replyTimeout });
}

async function turnSettled(page: Page): Promise<boolean> {
  const input = page.locator("#say");
  const down = await page.getByRole("alert").filter({ hasText: "Can't reach the home server" }).count();
  return (await input.isEnabled()) || down > 0;
}

export async function send(page: Page, utterance: string): Promise<string> {
  const input = page.locator("#say");
  await expect(input).toBeEnabled();
  const before = await page.locator(".transcript").innerText();
  await input.fill(utterance);
  await page.getByRole("button", { name: "Send" }).click();
  await expect.poll(() => turnSettled(page), { timeout: 20000 }).toBe(true);
  await expect.poll(async () => page.locator(".transcript").innerText(), { timeout: 20000 }).not.toBe(before);
  return page.locator(".transcript .assistant").last().innerText();
}

export async function latestReply(page: Page): Promise<string> {
  return page.locator(".transcript .assistant").last().innerText();
}

export async function openData(page: Page, tab: string): Promise<void> {
  const data = page.getByRole("complementary", { name: "Data" });
  if (!(await data.isVisible())) {
    await page.getByRole("button", { name: "Data", exact: true }).click();
  }
  await page.getByRole("complementary", { name: "Data" }).getByRole("button", { name: tab, exact: true }).click();
}

export async function expectNoSeriousAxe(page: Page): Promise<void> {
  const host = await new AxeBuilder({ page }).analyze();
  const hostBad = host.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => ({ id: violation.id, impact: violation.impact, nodes: violation.nodes.slice(0, 2).map((node) => node.html) }));
  expect(hostBad, JSON.stringify(hostBad, null, 2)).toEqual([]);

  for (const frame of page.frames()) {
    if (frame.parentFrame() === null) continue;
    const inner = await frame.evaluate(async (source) => {
      const runner = new Function(`${source}; return axe.run(document, { resultTypes: ['violations'] });`) as () => Promise<{
        violations: Array<{ id: string; impact: string | null; nodes: Array<{ html: string }> }>;
      }>;
      const result = await runner();
      return result.violations
        .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
        .map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          nodes: violation.nodes.slice(0, 2).map((node) => node.html),
        }));
    }, axeSource);
    expect(inner, JSON.stringify(inner, null, 2)).toEqual([]);
  }
}

export async function focusSay(page: Page): Promise<void> {
  for (let step = 0; step < 40; step += 1) {
    const id = await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.id : ""));
    if (id === "say") return;
    await page.keyboard.press("Tab");
  }
  throw new Error("Tab did not reach the say field");
}

export async function sendKeys(page: Page, utterance: string): Promise<void> {
  const before = await page.locator(".transcript").innerText();
  await focusSay(page);
  await page.keyboard.type(utterance);
  await page.keyboard.press("Enter");
  const input = page.locator("#say");
  await expect(input).toBeEnabled({ timeout: 20000 });
  await expect.poll(async () => page.locator(".transcript").innerText(), { timeout: 20000 }).not.toBe(before);
}
