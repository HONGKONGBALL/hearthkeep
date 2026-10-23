/**
 * A6: with two open tasks, Mark done on the second row closes that task.
 * The purchase code and household names are fictional seed data.
 */
import { card, expect, latestReply, openData, send, startSim, test } from "./support";

async function nextMorning(page: Parameters<typeof startSim>[0]): Promise<void> {
  await page.getByRole("button", { name: "Next morning" }).click();
  await expect(page.locator("#say")).toBeEnabled({ timeout: 20000 });
}

test("A6 clicking the second open task closes that task", async ({ page }) => {
  await startSim(page);
  await send(page, "Order a new filter for the fridge");
  await send(page, "Yes, the CX-28");
  const ordered = await send(page, "2468");
  expect(ordered.toLowerCase()).toContain("ordered");
  const chirp = await send(page, "The hallway smoke alarm keeps chirping");
  expect(chirp.toLowerCase()).toContain("nothing to buy");

  await nextMorning(page);
  await nextMorning(page);
  await expect(page.locator(".top")).toContainText("Fri, Oct 23, 2026");

  const openTasks = card(page).locator("section").filter({ hasText: "Open tasks" });
  const marks = openTasks.getByRole("button", { name: /Mark done/i });
  await expect(marks).toHaveCount(2);
  await expect(marks.nth(0)).toHaveAttribute("aria-label", /hallway smoke alarm battery/i);
  const second = marks.nth(1);
  await expect(second).toHaveAttribute("aria-label", /Install fridge water filter/i);
  const taskId = await second.getAttribute("data-task-id");
  expect(taskId).toMatch(/^t_\d+$/);
  await expect(second).toHaveAttribute("data-intent", `Done, I swapped it task ${taskId}`);

  const before = await page.locator(".transcript").innerText();
  await second.click();
  await expect.poll(async () => page.locator(".transcript").innerText(), { timeout: 20000 }).not.toBe(before);
  await expect(page.locator("#say")).toBeEnabled();

  await expect(page.locator(".transcript .user").last()).toHaveText(`Done, I swapped it task ${taskId}`);
  const reply = await latestReply(page);
  expect(reply.toLowerCase()).toContain("fridge water filter");
  expect(reply).toContain("April 2027");
  expect(reply).not.toContain("9-volt");
  expect(reply).not.toContain("October 2027");
  expect(reply.toLowerCase()).not.toContain("which one");

  await openData(page, "Tasks");
  const tasks = page.getByRole("complementary", { name: "Data" });
  const closed = tasks.locator("tbody tr", { hasText: taskId ?? "" });
  await expect(closed).toContainText("Install fridge water filter");
  await expect(closed).toContainText("closed");
  const battery = tasks.locator("tbody tr", { hasText: "Swap hallway smoke alarm battery" });
  await expect(battery).toContainText("open");

  await openData(page, "Schedule");
  const schedule = page.getByRole("complementary", { name: "Data" });
  await expect(schedule.locator("tbody tr", { hasText: "water_filter" })).toContainText("2027-04-21");
  await expect(schedule.locator("tbody tr", { hasText: "ap_smoke_hall" })).toContainText("2026-10-28");

  await openData(page, "Inventory");
  const inventory = page.getByRole("complementary", { name: "Data" });
  await expect(inventory.locator("tbody tr", { hasText: "9V" })).toContainText("2");
  await expect(inventory.locator("tbody tr", { hasText: "Rillstone CX-28" })).toContainText("0");
});
