/**
 * P-05: three wrong codes lock the quote, drop the checkout, and offer a new price.
 * Household names, prices, and the purchase code are fictional seed data.
 */
import { card, expect, send, startSim, test } from "./support";

test("P05 three wrong codes unlock a new fridge filter quote", async ({ page }) => {
  await startSim(page);
  await send(page, "Order a new filter for the fridge");
  await send(page, "Yes, the CX-28");
  await expect(page.locator(".lock")).toBeVisible();
  await expect(card(page).locator("body")).toContainText("Say your purchase code");

  const first = await send(page, "0000");
  expect(first.toLowerCase()).toContain("2 tries left");
  await expect(page.locator(".lock")).toBeVisible();

  const second = await send(page, "1111");
  expect(second.toLowerCase()).toContain("1 try left");

  const locked = await send(page, "2222");
  expect(locked.toLowerCase()).toContain("locked");
  expect(locked.toLowerCase()).toContain("say yes");
  expect(locked.toLowerCase()).toContain("price it again");
  await expect(page.locator(".lock")).toHaveCount(0);
  await expect(page.locator("iframe.card-frame")).toHaveCount(0);
  await expect(page.locator("label[for='say']")).toHaveText("Say something");
  await expect(page.locator(".transcript")).not.toContainText("ord_0001");

  const again = await send(page, "Yes");
  expect(again).toContain("$24.99");
  expect(again.toLowerCase()).toContain("purchase code");
  await expect(page.locator(".lock")).toBeVisible();
  await expect(card(page).locator("body")).toContainText("Say your purchase code");
  await expect(card(page).locator("body")).not.toContainText("ord_0001");

  const ordered = await send(page, "2468");
  expect(ordered.toLowerCase()).toContain("ordered");
  await expect(card(page).locator("body")).toContainText("ord_0001");
  await expect(card(page).locator("body")).toContainText("Placed");
});
