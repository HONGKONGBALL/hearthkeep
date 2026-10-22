/**
 * P-04: order a filter, wait until it arrives, then mark the install done.
 * Household names, prices, and the purchase code are fictional seed data.
 */
import { card, expect, latestReply, openData, send, startSim, test } from "./support";

async function nextMorning(page: Parameters<typeof startSim>[0]): Promise<void> {
  await page.getByRole("button", { name: "Next morning" }).click();
  await expect(page.locator("#say")).toBeEnabled({ timeout: 20000 });
}

test("P04 fridge filter closes after two mornings", async ({ page }) => {
  await startSim(page);
  await send(page, "Order a new filter for the fridge");
  await send(page, "Yes, the CX-28");
  const ordered = await send(page, "2468");
  expect(ordered.toLowerCase()).toContain("ordered");

  const early = await send(page, "Done");
  expect(early).not.toContain("9-volt");
  expect(early.toLowerCase()).toContain("hasn't arrived");
  await openData(page, "Schedule");
  const earlySchedule = page.getByRole("complementary", { name: "Data" }).locator("tbody tr", { hasText: "water_filter" });
  await expect(earlySchedule).toContainText("Wed, Oct 21");

  await nextMorning(page);
  await nextMorning(page);
  await expect(page.locator(".top")).toContainText("Fri, Oct 23, 2026");
  const morning = (await latestReply(page)).toLowerCase();
  expect(morning).toContain("arrived");
  expect(morning).toContain("installed");
  expect(morning).not.toContain("2 days overdue");
  await expect(card(page).getByRole("button", { name: "Mark done" })).toBeVisible();

  const done = await send(page, "Done");
  expect(done).not.toContain("9-volt");
  expect(done).toContain("April 2027");
  await openData(page, "Tasks");
  const task = page.getByRole("complementary", { name: "Data" }).locator("tbody tr", { hasText: "t_0001" });
  await expect(task).toContainText("closed");
  await openData(page, "Inventory");
  const stock = page.getByRole("complementary", { name: "Data" }).locator("tbody tr", { hasText: "Rillstone CX-28" });
  await expect(stock).toContainText("0");
  await openData(page, "Schedule");
  const schedule = page.getByRole("complementary", { name: "Data" }).locator("tbody tr", { hasText: "water_filter" });
  await expect(schedule).toContainText("Wed, Apr 21");
});

test("P04 furnace filter closes on the same path", async ({ page }) => {
  await startSim(page);
  await send(page, "Reorder the furnace filter");
  await send(page, "Yes");
  const ordered = await send(page, "2468");
  expect(ordered.toLowerCase()).toContain("ordered");

  const early = await send(page, "Done");
  expect(early).not.toContain("9-volt");
  expect(early.toLowerCase()).toContain("hasn't arrived");
  expect(early.toLowerCase()).not.toContain("water filter");

  await nextMorning(page);
  await nextMorning(page);
  const done = await send(page, "Done");
  expect(done).not.toContain("9-volt");
  expect(done).toContain("January 2027");
  expect(done.toLowerCase()).toContain("furnace");
  await openData(page, "Tasks");
  const task = page.getByRole("complementary", { name: "Data" }).locator("tbody tr", { hasText: "t_0001" });
  await expect(task).toContainText("closed");
  await openData(page, "Inventory");
  const stock = page.getByRole("complementary", { name: "Data" }).locator("tbody tr", { hasText: "Loftaire" });
  await expect(stock.locator("td").nth(2)).toHaveText("2");
  await openData(page, "Schedule");
  const schedule = page.getByRole("complementary", { name: "Data" }).locator("tbody tr", { hasText: "air_filter" });
  await expect(schedule).toContainText("Thu, Jan 21");
});
