/**
 * QA section F. MCP Apps cards in the simulator. Fictional household only.
 */
import { card, childFrame, expect, send, startSim, test } from "./support";

test("58 status card is sandboxed and lists attention and upcoming", async ({ page }) => {
  await startSim(page);
  const frame = page.locator("iframe.card-frame");
  await expect(frame).toHaveAttribute("sandbox", "allow-scripts");
  const sandbox = await frame.getAttribute("sandbox");
  expect(sandbox ?? "").not.toContain("allow-same-origin");

  const body = card(page).locator("body");
  await expect(body).toContainText("Fictional data");
  await expect(body).toContainText("Dryer vent cleaning, 21 days overdue");
  await expect(body).toContainText("Fridge water filter, due today");
  await expect(body).toContainText("Hallway smoke alarm battery, Wed, Oct 28");
  await expect(body).toContainText("Furnace filter, Fri, Oct 30");

  const access = await childFrame(page).evaluate(() => {
    try {
      return typeof parent.document;
    } catch {
      return "threw";
    }
  });
  expect(access).toBe("threw");
});

test("59 and 60 carousel keys move focus and Choose prepares checkout", async ({ page }) => {
  await startSim(page);
  await send(page, "Order a new filter for the fridge");
  const tiles = card(page).locator("[data-tile]");
  await expect(tiles).toHaveCount(2);
  await expect(tiles.nth(0)).toContainText("Rillstone CX-28");
  await expect(tiles.nth(0)).toContainText("$24.99");
  await expect(tiles.nth(0)).toContainText("Compatible");
  await expect(tiles.nth(0)).toContainText("Certified");
  await expect(tiles.nth(0)).toContainText("Recommended");
  await expect(tiles.nth(0)).toContainText("Arrives Fri, Oct 23");
  await expect(tiles.nth(1)).toContainText("Ferngate FG-WF2");
  await expect(tiles.nth(1)).toContainText("$49.99");
  await expect(tiles.nth(1)).toContainText("OEM");
  await expect(tiles.nth(1)).toContainText("Certified");
  await expect(card(page).locator("body")).toContainText("Not shown: Bargo ZX-28, not certified (your rules)");

  for (let step = 0; step < 50; step += 1) {
    const focused = await childFrame(page).evaluate(() => document.activeElement?.textContent ?? "");
    if (focused.includes("Rillstone")) break;
    await page.keyboard.press("Tab");
  }
  await expect.poll(() => childFrame(page).evaluate(() => document.activeElement?.textContent ?? "")).toContain("Rillstone");

  await page.keyboard.press("ArrowRight");
  await expect.poll(() => childFrame(page).evaluate(() => document.activeElement?.textContent ?? "")).toContain("Ferngate");
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => childFrame(page).evaluate(() => document.activeElement?.textContent ?? "")).toContain("Rillstone");
  await card(page).locator("[data-tile]", { hasText: "Rillstone CX-28" }).press("Enter");

  await expect(page.locator(".transcript .user").last()).toHaveText("Choose Rillstone CX-28");
  await expect(page.locator(".transcript .assistant").last()).toContainText("purchase code");
  await page.getByRole("button", { name: "Trace", exact: true }).click();
  const turn = page.getByRole("complementary", { name: "Trace" }).locator("article").last();
  await expect(turn).toContainText("prepare_checkout");
  await expect(turn).not.toContainText("confirm_purchase");
});

test("62 card frames do not request anything during F1 to F4", async ({ page, monitor }) => {
  await startSim(page);
  await send(page, "Order a new filter for the fridge");
  await send(page, "Yes, the CX-28");
  await send(page, "2468");
  await send(page, "Book someone to clean the dryer vent next week");
  await send(page, "Tuesday morning");
  await send(page, "2468");
  await send(page, "Approve 2468");
  expect(monitor.cardRequests).toEqual([]);
});

test("63 text-only replies keep price, arrival, slot, and the limit", async ({ page }) => {
  await startSim(page);
  await page.getByRole("button", { name: "Cards", exact: true }).click();
  const session = await page.locator(".identity .meta").first().innerText();
  await page.getByRole("button", { name: "Reset demo" }).click();
  await expect(page.locator(".identity .meta").first()).not.toHaveText(session);
  await expect(page.locator("#say")).toBeEnabled();
  await expect(page.locator(".transcript .assistant").last()).toContainText(/dryer vent/i);
  await expect(page.locator("iframe")).toHaveCount(0);

  const offered = await send(page, "Order a new filter for the fridge");
  expect(offered.toLowerCase()).toContain("ferngate fg-28");
  expect(offered).toContain("Rillstone CX-28");
  expect(offered).toContain("$24.99");
  expect(offered.toLowerCase()).toContain("friday");
  await expect(page.locator("iframe")).toHaveCount(0);

  const priced = await send(page, "Yes, the CX-28");
  expect(priced).toContain("$24.99");
  expect(priced).toContain("October 23");
  expect(priced).toContain("Within your $60 limit");
  const pricedSentences = priced.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter((part) => part !== "");
  expect(pricedSentences.length).toBeLessThanOrEqual(2);
  expect(priced.toLowerCase()).toContain("purchase code");
  await expect(page.locator("iframe")).toHaveCount(0);

  await send(page, "2468");
  await expect(page.locator(".transcript .assistant").last()).toContainText(/ordered/i);
  await expect(page.locator("iframe")).toHaveCount(0);

  const openings = await send(page, "Book someone to clean the dryer vent next week");
  await expect(page.locator("iframe")).toHaveCount(0);
  expect(openings.toLowerCase()).toContain("tuesday");
  expect(openings).toContain("$89");

  const quote = await send(page, "Tuesday morning");
  expect(quote).toContain("$89");
  expect(quote.toLowerCase()).toContain("over your $60 limit");
  expect(quote.toLowerCase()).toContain("approve");
  await expect(page.locator("iframe")).toHaveCount(0);
});
