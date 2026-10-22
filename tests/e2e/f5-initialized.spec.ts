/**
 * P-12: after initialize, the host sends notifications/initialized.
 * The Session trace lists initialize 200, then initialized 202.
 * Fictional household data only.
 */
import { type Locator, type Page, type Request } from "@playwright/test";
import { expect, startSim, test } from "./support";

function rpcMethod(request: Request): string | null {
  if (request.method() !== "POST" || !request.url().includes("/mcp")) return null;
  const raw = request.postData();
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as { method?: unknown };
    return typeof parsed.method === "string" ? parsed.method : null;
  } catch {
    return null;
  }
}

function handshakeIndexes(lines: string[]): { init: number; noted: number } {
  const trimmed = lines.map((line) => line.replace(/\s+/g, " ").trim());
  return {
    init: trimmed.findIndex((line) => line.startsWith("initialize 200")),
    noted: trimmed.findIndex((line) => line.includes("initialized 202")),
  };
}

async function sessionLines(page: Page): Promise<string[]> {
  const session = page
    .getByRole("complementary", { name: "Trace" })
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: "Session opened" }) })
    .last();
  return session.locator("li").allTextContents();
}

async function expectLineFits(line: Locator): Promise<void> {
  const fit = await line.evaluate((node) => ({
    scrollWidth: node.scrollWidth,
    clientWidth: node.clientWidth,
  }));
  expect(fit.scrollWidth).toBeLessThanOrEqual(fit.clientWidth + 1);
}

test("P-12 session trace lists initialize 200 then initialized 202", async ({ page }) => {
  const calls: Array<{ method: string; status: number }> = [];
  page.on("response", (response) => {
    const method = rpcMethod(response.request());
    if (method === null) return;
    calls.push({ method, status: response.status() });
  });

  await startSim(page);
  const initAt = calls.findIndex((call) => call.method === "initialize");
  const notedAt = calls.findIndex((call) => call.method === "notifications/initialized");
  expect(initAt).toBeGreaterThanOrEqual(0);
  expect(notedAt).toBe(initAt + 1);
  expect(calls[initAt]?.status).toBe(200);
  expect(calls[notedAt]?.status).toBe(202);

  await page.getByRole("button", { name: "Trace", exact: true }).click();
  const opened = handshakeIndexes(await sessionLines(page));
  expect(opened.init).toBe(0);
  expect(opened.noted).toBe(opened.init + 1);

  const trace = page.getByRole("complementary", { name: "Trace" });
  const firstLines = trace.locator("article").last().locator("li");
  await expect(firstLines.nth(opened.init)).toBeVisible();
  await expect(firstLines.nth(opened.noted)).toBeVisible();
  await expectLineFits(firstLines.nth(opened.noted));
  await page.screenshot({ path: "docs/screens/rc2/f5-session-initialized.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 800 });
  await expect(firstLines.nth(opened.noted)).toBeVisible();
  await expectLineFits(firstLines.nth(opened.noted));
  await page.screenshot({ path: "docs/screens/rc2/f5-session-initialized-390.png", fullPage: true });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole("button", { name: "Next morning" }).click();
  await expect(page.locator("#say")).toBeEnabled();
  const renewed = handshakeIndexes(await sessionLines(page));
  expect(renewed.init).toBeGreaterThanOrEqual(0);
  expect(renewed.noted).toBe(renewed.init + 1);
});
