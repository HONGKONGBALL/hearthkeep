/**
 * A4: F4 checkout is over the $60 cap. Confirm by voice must ask for approve
 * and must not send the purchase. Names, prices, and the code are fictional.
 */
import { card, expect, latestReply, openData, send, startSim, test } from "./support";

test("A4 Confirm by voice on the over-cap checkout asks for approve", async ({ page }) => {
  await startSim(page);
  await send(page, "Book someone to clean the dryer vent next week");
  await send(page, "Tuesday morning");

  const checkout = card(page).locator("body");
  await expect(checkout).toContainText("Over your $60 limit by $29.00");
  await expect(checkout).toContainText("Say 'approve' and your code");
  const voice = card(page).getByRole("button", { name: "Confirm by voice" });
  await expect(voice).toBeVisible();

  const before = await page.locator(".transcript").innerText();
  await voice.click();
  await expect.poll(async () => page.locator(".transcript").innerText(), { timeout: 20000 }).not.toBe(before);
  await expect(page.locator("#say")).toBeEnabled();

  const reply = await latestReply(page);
  expect(reply.toLowerCase()).toContain("approve");
  expect(reply).toBe("Say 'approve' and your code.");
  await expect(page.locator(".transcript .user").last()).toHaveText("Confirm by voice");
  await expect(page.locator("#say")).toHaveAttribute("placeholder", "Waiting for “approve” and your code");

  await page.getByRole("button", { name: "Trace", exact: true }).click();
  const turn = page.getByRole("complementary", { name: "Trace" }).locator("article").last();
  await expect(turn).toContainText("Confirm by voice");
  await expect(turn).not.toContainText("confirm_purchase");
  await expect(turn).not.toContainText("OVER_CAP_APPROVAL_REQUIRED");

  await openData(page, "Orders and bookings");
  const bookings = page.getByRole("complementary", { name: "Data" }).locator("table").nth(1).locator("tbody tr");
  await expect(bookings).toHaveCount(0);
});
