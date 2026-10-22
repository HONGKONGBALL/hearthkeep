/**
 * P-02: Start, then "Yes", continues the briefing. Cards off uses the same reply.
 * Fictional household only.
 */
import { expect, send, startSim, test } from "./support";

function expectNextStep(reply: string): void {
  expect(reply.toLowerCase()).not.toContain("don't have options");
  expect(reply).not.toContain("I can help with home upkeep");
  expect(reply).toContain("three openings");
  expect(reply).toContain("Tuesday");
  expect(reply).toContain("$89");
  expect(reply.toLowerCase()).toContain("dryer");
}

test("Start then Yes gives the dryer vent next step with cards on and off", async ({ page }) => {
  await startSim(page);
  await expect(page.locator(".transcript .assistant").last()).toContainText(/want me to handle them/i);
  expectNextStep(await send(page, "Yes"));

  await page.getByRole("button", { name: "Cards", exact: true }).click();
  const session = await page.locator(".identity .meta").first().innerText();
  await page.getByRole("button", { name: "Reset demo" }).click();
  await expect(page.locator(".identity .meta").first()).not.toHaveText(session);
  await expect(page.locator("#say")).toBeEnabled();
  await expect(page.locator(".transcript .assistant").last()).toContainText(/want me to handle them/i);
  await expect(page.locator("iframe")).toHaveCount(0);
  expectNextStep(await send(page, "Yes"));
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.locator(".stage")).toContainText("Cards are off");
});
