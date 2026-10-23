/**
 * A2: the hazard banner and the hidden card stage last only for the turn that raised them.
 * The next briefing shows the status card. Household lines are fictional sample data.
 */
import { card, expect, send, startSim, test } from "./support";

test("A2 the next turn after a gas alert shows the status card", async ({ page }) => {
  await startSim(page);
  const hazard = await send(page, "I smell gas in the kitchen");
  expect(hazard.toLowerCase()).toContain("leave");
  await expect(page.locator("p.alert")).toBeVisible();
  await expect(page.locator("p.alert")).toContainText(/smell gas/i);
  await expect(page.locator("iframe.card-frame")).toHaveCount(0);

  await send(page, "What needs doing?");
  await expect(page.locator("iframe.card-frame")).toBeVisible();
  await expect(card(page).locator("body")).toContainText("Needs attention");
  await expect(page.locator("p.alert")).toHaveCount(0);
});
