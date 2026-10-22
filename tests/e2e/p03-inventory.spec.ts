/**
 * P-03: ordering a part checks the shelf before checkout.
 * Household names and prices are fictional sample data.
 */
import { expect, send, startSim, test } from "./support";

test("P03 ordering a hallway battery uses the shelf", async ({ page }) => {
  await startSim(page);
  const reply = await send(page, "Order a battery for the hallway smoke alarm");
  expect(reply.toLowerCase()).toContain("two 9-volt");
  expect(reply.toLowerCase()).toContain("garage shelf");
  expect(reply.toLowerCase()).toContain("nothing to buy");
  expect(reply).not.toMatch(/One batteries/);
  expect(reply).not.toContain("$11.49");
  await page.getByRole("button", { name: "Trace", exact: true }).click();
  const turn = page.getByRole("complementary", { name: "Trace" }).locator("article").last();
  await expect(turn).toContainText("find_parts");
  await expect(turn).toContainText("create_task");
  await expect(turn).not.toContainText("prepare_checkout");
});
