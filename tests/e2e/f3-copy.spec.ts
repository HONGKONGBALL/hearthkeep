/**
 * Visible copy from the rc1 review. Screenshots are the f3 review set.
 * Fictional demo data only.
 */
import { card, expect, latestReply, send, startSim, test } from "./support";

test("P09 and P10 visible copy", async ({ page }) => {
  await startSim(page);
  const status = card(page).locator("body");
  await expect(status.getByRole("button", { name: "Replace battery" })).toBeVisible();
  await expect(status).not.toContainText("keeps chirping");
  await status.getByRole("button", { name: "Replace battery" }).click();
  await expect(page.locator(".transcript .user").last()).toHaveText("Replace the hallway smoke alarm battery");
  await expect(page.locator(".transcript .assistant").last()).toContainText(/two 9-volt batteries on the garage shelf/i);
  await expect(page.locator(".transcript .assistant").last()).toContainText("Nothing to buy, so I added a task");
  await expect(page.locator(".transcript .assistant").last()).not.toContainText(/\. nothing/);
  const shelfReply = await latestReply(page);
  expect(shelfReply).not.toMatch(/chirp/i);

  const task = card(page).locator("body");
  await expect(task.locator(".label").nth(0)).toHaveText("Due");
  await expect(task.locator(".label").nth(1)).toHaveText("Appliance");
  await expect(task.locator(".label").nth(2)).toHaveText("Supplies");
  await expect(task.locator("p.meta", { hasText: "Appliance" })).toHaveText("Appliance Hallway smoke alarm");
  await page.screenshot({ path: "docs/screens/rc2/f3-task-card.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 800 });
  await expect(task.locator(".label", { hasText: "Due" })).toBeVisible();
  await expect(task.locator(".label", { hasText: "Appliance" })).toBeVisible();
  await expect(task.locator(".label", { hasText: "Supplies" })).toBeVisible();
  await expect(task.getByRole("button", { name: "Mark done" })).toBeVisible();
  await page.screenshot({ path: "docs/screens/rc2/f3-task-card-390.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 800 });

  await send(page, "Done, I swapped it");
  await expect(page.locator(".transcript .assistant").last()).toContainText("October 2027");
  const closed = card(page).locator("body");
  await expect(closed.locator(".label").nth(0)).toHaveText("Next due");
  await expect(closed.locator("p.meta").first()).toContainText("October 2027");
  await expect(closed.locator("p.meta", { hasText: "Appliance" })).toHaveText("Appliance Hallway smoke alarm");
  await page.screenshot({ path: "docs/screens/rc2/f3-task-next-due.png", fullPage: true });

  await page.getByRole("button", { name: "Reset demo" }).click();
  await expect(page.locator("#say")).toBeEnabled();
  await expect(page.locator(".transcript .assistant").last()).toContainText(/dryer vent/i);
  await send(page, "Order a new filter for the fridge");
  const priced = await send(page, "Yes, the CX-28");
  expect(priced).toContain("$24.99");
  expect(priced).toContain("October 23");
  expect(priced).toContain("Within your $60 limit");
  expect(priced.toLowerCase()).toContain("purchase code");
  const sentences = priced.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter((part) => part !== "");
  expect(sentences.length).toBeLessThanOrEqual(2);
  await page.screenshot({ path: "docs/screens/rc2/f3-parts-limit.png", fullPage: true });

  await page.getByRole("button", { name: "Reset demo" }).click();
  await expect(page.locator("#say")).toBeEnabled();
  await expect(page.locator(".transcript .assistant").last()).toContainText(/dryer vent/i);
  await page.getByRole("button", { name: "Next morning" }).click();
  await expect(page.locator(".top")).toContainText("Thu, Oct 22, 2026");
  await expect(page.locator(".transcript .assistant").last()).toContainText("1 day overdue", { timeout: 20000 });
  await expect(page.locator(".transcript .assistant").last()).not.toContainText("1 days overdue");
  const morning = card(page).locator("body");
  await expect(morning.getByText("Fridge water filter, 1 day overdue")).toBeVisible();
  await expect(morning.getByText("1 days overdue")).toHaveCount(0);
  await page.screenshot({ path: "docs/screens/rc2/f3-one-day-overdue.png", fullPage: true });
});
