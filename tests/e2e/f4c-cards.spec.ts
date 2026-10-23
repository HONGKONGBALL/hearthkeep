/**
 * P-08. Cards in the 1280×800 frame show their key lines without an inner scroll.
 * Fictional household data only.
 */
import { type Page } from "@playwright/test";
import { card, childFrame, e2eShot, expect, send, startSim, test } from "./support";

async function cardBox(page: Page): Promise<{ scrollHeight: number; clientHeight: number }> {
  return childFrame(page).evaluate(() => {
    const root = document.documentElement;
    return { scrollHeight: root.scrollHeight, clientHeight: root.clientHeight };
  });
}

async function expectCardFits(page: Page): Promise<void> {
  const fit = await cardBox(page);
  expect(fit.scrollHeight).toBeLessThanOrEqual(fit.clientHeight);
}

async function expectTilesInside(page: Page): Promise<void> {
  const inside = await childFrame(page).evaluate(() => {
    const view = document.documentElement.clientWidth;
    return [...document.querySelectorAll(".tile")].every((node) => {
      const rect = node.getBoundingClientRect();
      if (rect.right > view + 1) return false;
      return [...node.querySelectorAll("strong, span")].every((child) => {
        const box = child.getBoundingClientRect();
        return box.left >= rect.left - 1 && box.right <= rect.right + 1;
      });
    });
  });
  expect(inside).toBe(true);
}

async function expectHorizontal(page: Page): Promise<void> {
  const boxes = await childFrame(page).evaluate(() => {
    return [...document.querySelectorAll("[data-tile]")].map((node) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, right: rect.right };
    });
  });
  expect(boxes.length).toBeGreaterThan(1);
  for (let index = 1; index < boxes.length; index += 1) {
    const previous = boxes[index - 1];
    const current = boxes[index];
    if (previous === undefined || current === undefined) throw new Error("missing tile box");
    expect(current.x).toBeGreaterThan(previous.right - 1);
    expect(Math.abs(current.y - (boxes[0]?.y ?? current.y))).toBeLessThan(2);
  }
}

test("P08 status, options, checkout, receipt, and task cards fit", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await startSim(page);

  const status = card(page);
  await expect(status.getByRole("button", { name: "Handle it, Dryer vent cleaning" })).toBeVisible();
  await expect(status.getByRole("button", { name: "Handle it, Fridge water filter" })).toBeVisible();
  await expect(status.getByRole("button", { name: "Replace battery, Hallway smoke alarm battery" })).toBeVisible();
  await expect(status.getByText("Furnace filter, Fri, Oct 30")).toBeVisible();

  const grouped = await childFrame(page).evaluate(() => {
    const row = document.querySelector(".row");
    const button = row?.querySelector("button");
    const label = row?.querySelector("span");
    const next = row?.nextElementSibling;
    if (!row || !button || !label || !next) return null;
    const rowBox = row.getBoundingClientRect();
    const buttonBox = button.getBoundingClientRect();
    const labelBox = label.getBoundingClientRect();
    const nextBox = next.getBoundingClientRect();
    return {
      inside:
        buttonBox.left >= rowBox.left - 1 &&
        buttonBox.right <= rowBox.right + 1 &&
        buttonBox.top >= rowBox.top - 1 &&
        buttonBox.bottom <= rowBox.bottom + 1,
      gapToLabel: buttonBox.left - labelBox.right,
      gapToNext: nextBox.top - buttonBox.bottom,
    };
  });
  expect(grouped).not.toBeNull();
  expect(grouped?.inside).toBe(true);
  expect(grouped?.gapToNext ?? 0).toBeGreaterThan(grouped?.gapToLabel ?? 0);
  await expectCardFits(page);
  await page.screenshot({ path: e2eShot("c1-status-card.png") });

  await send(page, "Book someone to clean the dryer vent next week");
  await expect(card(page).locator("[data-tile]")).toHaveCount(3);
  await expectHorizontal(page);
  await expectTilesInside(page);
  await expectCardFits(page);

  await page.getByRole("button", { name: "Reset demo" }).click();
  await expect(page.locator("#say")).toBeEnabled();
  await expect(page.locator(".transcript .assistant").last()).toContainText(/dryer vent/i);

  await send(page, "Order a new filter for the fridge");
  const options = card(page);
  await expect(options.locator("[data-tile]")).toHaveCount(2);
  await expectHorizontal(page);
  await expectTilesInside(page);
  await expect(options.locator(".foot")).toHaveText("Not shown: Bargo ZX-28, not certified (your rules)");
  const foot = await childFrame(page).evaluate(() => {
    const node = document.querySelector(".foot");
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    const height = document.documentElement.clientHeight;
    return rect.top >= 0 && rect.bottom <= height + 1;
  });
  expect(foot).toBe(true);
  const optionNames = await childFrame(page).evaluate(() => {
    return [...document.querySelectorAll("[data-tile]")].map((node) => node.textContent ?? "");
  });
  expect(optionNames[0]).toContain("Rillstone CX-28");
  expect(optionNames[0]).toContain("Choose");
  expect(optionNames[1]).toContain("Ferngate FG-WF2");
  expect(optionNames[0]).not.toBe(optionNames[1]);
  await expectCardFits(page);
  await page.screenshot({ path: e2eShot("c2-options-carousel.png") });

  await send(page, "Yes, the CX-28");
  const checkout = card(page).locator("body");
  await expect(checkout).toContainText("Total $24.99");
  await expect(checkout).toContainText("Within your $60 limit");
  await expectCardFits(page);
  await page.screenshot({ path: e2eShot("c3-checkout-card.png") });

  await send(page, "2468");
  const receipt = card(page).locator("body");
  await expect(receipt).toContainText("ord_0001");
  await expect(receipt).toContainText("Mock order, no real purchase or payment");
  await expectCardFits(page);
  await page.screenshot({ path: e2eShot("c4-receipt-card.png") });

  await page.getByRole("button", { name: "Reset demo" }).click();
  await expect(page.locator("#say")).toBeEnabled();
  await expect(page.locator(".transcript .assistant").last()).toContainText(/dryer vent/i);
  await card(page).getByRole("button", { name: "Replace battery, Hallway smoke alarm battery" }).click();
  const task = card(page).locator("body");
  await expect(card(page).getByRole("button", { name: "Mark done, Swap hallway smoke alarm battery" })).toBeVisible();
  await expect(task).toContainText("Hallway smoke alarm");
  await expectCardFits(page);
  await page.screenshot({ path: e2eShot("c5-task-card.png") });
});
