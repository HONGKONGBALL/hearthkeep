/**
 * A1: F2 then F4, then Next morning. Order and task rows stay on the wide
 * text column. Household names and the purchase code are fictional sample data.
 */
import { type Page } from "@playwright/test";
import { card, childFrame, expect, send, startSim, test } from "./support";

async function expectCardFits(page: Page): Promise<void> {
  const fit = await childFrame(page).evaluate(() => {
    const root = document.documentElement;
    return { scrollHeight: root.scrollHeight, clientHeight: root.clientHeight };
  });
  expect(fit.scrollHeight).toBeLessThanOrEqual(fit.clientHeight);
}

test("A1 next morning status rows use the wide text column", async ({ page }) => {
  await startSim(page);
  await send(page, "Order a new filter for the fridge");
  await send(page, "Yes, the CX-28");
  await send(page, "2468");
  await send(page, "Book someone to clean the dryer vent next week");
  await send(page, "Tuesday morning");
  await send(page, "Approve 2468");
  await page.getByRole("button", { name: "Next morning" }).click();
  await expect(page.locator("#say")).toBeEnabled();
  await expect(page.locator(".top")).toContainText("Thu, Oct 22, 2026");

  const status = card(page).locator("body");
  await expect(status).toContainText("Rillstone CX-28 (Shipped)");
  await expect(status).toContainText("Dryer vent cleaning (Tue, Oct 27)");
  await expect(status).toContainText("Install fridge water filter");

  const rows = await childFrame(page).evaluate(() => {
    return [...document.querySelectorAll('main[data-card="status"] li')].map((li) => {
      const row = li.getBoundingClientRect();
      const span = li.querySelector("span");
      const textBox = span ? span.getBoundingClientRect() : row;
      const button = li.querySelector("button");
      const buttonBox = button ? button.getBoundingClientRect() : null;
      const lineHeight = parseFloat(getComputedStyle(span ?? li).lineHeight);
      return {
        text: (span?.textContent ?? "").trim(),
        textWidth: textBox.width,
        textHeight: textBox.height,
        rowWidth: row.width,
        lineHeight,
        buttonWidth: buttonBox ? buttonBox.width : 0,
        hasRing: li.querySelector(".hk-ring") !== null,
        applianceId: li.getAttribute("data-appliance-id") ?? "",
        item: li.getAttribute("data-item") ?? "",
      };
    });
  });

  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    expect(row.rowWidth, row.text).toBeGreaterThan(0);
    expect(row.textWidth / row.rowWidth, row.text).toBeGreaterThanOrEqual(0.5);
    expect(row.lineHeight, row.text).toBeGreaterThan(0);
    expect(row.textHeight, row.text).toBeLessThanOrEqual(row.lineHeight * 2 + 1);
    if (row.buttonWidth > 0) {
      expect(row.buttonWidth, row.text).toBeLessThan(row.textWidth);
    }
    if (row.applianceId !== "" && row.item !== "") {
      expect(row.hasRing, row.text).toBe(true);
    }
  }

  const shipped = rows.find((row) => row.text.includes("Rillstone CX-28"));
  const task = rows.find((row) => row.text.includes("Install fridge water filter"));
  expect(shipped?.hasRing).toBe(true);
  expect(task?.hasRing).toBe(true);
  expect(task?.buttonWidth ?? 0).toBeGreaterThan(0);

  await expectCardFits(page);
  await page.locator("iframe.card-frame").screenshot({ path: "docs/screens/rc4/a1-1280-next-morning.png" });
});
