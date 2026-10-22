/**
 * P-07 welcome layer isolates the page behind it.
 * Tab from Start stays in the dialog. The seeded sim clock does not move before Start.
 * Household names in the sim are fictional.
 */
import type { APIRequestContext, Page } from "@playwright/test";
import { MCP_URL } from "./servers";
import { expect, openWelcome, test } from "./support";

const SEEDED_CLOCK = "2026-10-21T09:00:00-07:00";

async function serverClock(request: APIRequestContext): Promise<string> {
  const response = await request.get(`${MCP_URL}/healthz`);
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { simNow?: string };
  if (!body.simNow) throw new Error("healthz returned no simNow");
  return body.simNow;
}

async function focusInsideDialog(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const dialog = document.querySelector("[role='dialog']");
    const active = document.activeElement;
    return dialog !== null && active instanceof Node && dialog.contains(active);
  });
}

test("P-07 Tab stays in the welcome dialog and the server clock stays put", async ({ page, request }) => {
  const before = await serverClock(request);
  expect(before).toBe(SEEDED_CLOCK);

  const sideEffects: string[] = [];
  page.on("request", (req) => {
    const url = req.url();
    if (url.startsWith(`${MCP_URL}/sim/clock`) || url.startsWith(`${MCP_URL}/mcp`)) {
      sideEffects.push(`${req.method()} ${url}`);
    }
  });

  await openWelcome(page);
  const dialog = page.getByRole("dialog");
  const start = dialog.getByRole("button", { name: "Start" });
  await expect(start).toBeFocused();
  await expect(dialog).toHaveAttribute("aria-modal", "true");

  const shell = page.locator(".app-shell");
  await expect(shell).toHaveAttribute("inert", "");
  const next = page.locator(".app-shell button", { hasText: "Next morning" });
  await expect(next).toHaveCount(1);
  const client = await page.context().newCDPSession(page);
  const tree = await client.send("Accessibility.getFullAXTree");
  const exposed = tree.nodes.filter((node) => (node.name?.value ?? "").includes("Next morning"));
  expect(exposed, "Next morning is still in the accessibility tree").toEqual([]);

  const frame = await page.locator(".frame").boundingBox();
  expect(frame?.height ?? 0).toBeGreaterThan(400);

  for (let step = 0; step < 12; step += 1) {
    await page.keyboard.press("Tab");
    expect(await focusInsideDialog(page), `Tab ${step + 1} left the dialog`).toBe(true);
    expect(await serverClock(request), `clock after Tab ${step + 1}`).toBe(SEEDED_CLOCK);
  }

  for (let step = 0; step < 4; step += 1) {
    await page.keyboard.press("Shift+Tab");
    expect(await focusInsideDialog(page), `Shift+Tab ${step + 1} left the dialog`).toBe(true);
  }

  const blocked = await next.evaluate((node) => {
    if (!(node instanceof HTMLElement)) return "missing";
    node.focus();
    return document.activeElement === node ? "focused" : "blocked";
  });
  expect(blocked).toBe("blocked");
  expect(await focusInsideDialog(page)).toBe(true);
  expect(await serverClock(request)).toBe(before);
  expect(sideEffects).toEqual([]);

  await page.screenshot({ path: "docs/screens/rc2/f4b-welcome-tab.png", fullPage: true });
});
