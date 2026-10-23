/**
 * A5: the task card uses the v4 skin in the open and completed states.
 * Copy, roles, and labels stay the ones f3-copy already asserts. Fictional sample data.
 */
import { type Page } from "@playwright/test";
import { card, childFrame, expect, expectNoSeriousAxe, send, startSim, test } from "./support";

async function expectCardFits(page: Page): Promise<void> {
  await expect.poll(async () => {
    return childFrame(page).evaluate(() => document.documentElement.scrollHeight <= document.documentElement.clientHeight);
  }).toBe(true);
}

async function taskSkin(page: Page): Promise<{
  chipBg: string;
  chipColor: string;
  bodyBg: string;
  font: string;
  labelTransform: string;
  buttonBg: string;
  buttonRadius: string;
}> {
  return childFrame(page).evaluate(() => {
    const chip = document.querySelector("body > .chip");
    const label = document.querySelector(".label");
    const button = document.querySelector("#done");
    const chipStyle = chip ? getComputedStyle(chip) : null;
    const labelStyle = label ? getComputedStyle(label) : null;
    const buttonStyle = button ? getComputedStyle(button) : null;
    return {
      chipBg: chipStyle?.backgroundColor ?? "",
      chipColor: chipStyle?.color ?? "",
      bodyBg: getComputedStyle(document.body).backgroundColor,
      font: getComputedStyle(document.body).fontFamily,
      labelTransform: labelStyle?.textTransform ?? "",
      buttonBg: buttonStyle?.backgroundColor ?? "",
      buttonRadius: buttonStyle?.borderRadius ?? "",
    };
  });
}

test("A5 task card open and completed states use the v4 skin", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await startSim(page);
  await card(page).getByRole("button", { name: "Replace battery, Hallway smoke alarm battery" }).click();

  const task = card(page).locator("body");
  await expect(task.locator(".label").nth(0)).toHaveText("Due");
  await expect(task.locator(".label").nth(1)).toHaveText("Appliance");
  await expect(task.locator(".label").nth(2)).toHaveText("Supplies");
  await expect(task.locator("p.meta", { hasText: "Appliance" })).toHaveText("Appliance Hallway smoke alarm");
  await expect(task.getByRole("button", { name: "Mark done" })).toBeVisible();
  await expect(task.locator(".say .q")).toHaveText(/Done, I swapped it/);
  await expect(task.locator("body > .chip, .chip").first()).toContainText("Fictional data");

  const open = await taskSkin(page);
  expect(open.chipBg).toBe("rgb(213, 243, 223)");
  expect(open.chipColor).toBe("rgb(11, 112, 57)");
  expect(open.bodyBg).toBe("rgba(0, 0, 0, 0)");
  expect(open.font.toLowerCase()).toContain("figtree");
  expect(open.labelTransform).toBe("uppercase");
  expect(open.buttonBg).toBe("rgb(255, 254, 248)");
  expect(open.buttonRadius).toBe("999px");
  expect(open.buttonBg).not.toBe("rgb(20, 61, 44)");

  await expectCardFits(page);
  await expectNoSeriousAxe(page);
  await page.screenshot({ path: "docs/screens/rc4/a5-1280-task-open.png" });

  await page.setViewportSize({ width: 390, height: 800 });
  await expect(task.getByRole("button", { name: "Mark done" })).toBeVisible();
  await expect(task.locator(".label", { hasText: "Due" })).toBeVisible();
  await expectCardFits(page);
  await expectNoSeriousAxe(page);
  await page.locator("iframe.card-frame").evaluate((node) => node.scrollIntoView({ block: "center", inline: "nearest" }));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))));
  await page.screenshot({ path: "docs/screens/rc4/a5-390-task-open.png", fullPage: true });

  await page.setViewportSize({ width: 1280, height: 800 });
  await send(page, "Done, I swapped it");
  const closed = card(page).locator("body");
  await expect(closed.locator(".label").nth(0)).toHaveText("Next due");
  await expect(closed.locator("p.meta").first()).toContainText("October 2027");
  await expect(closed.locator("p.meta", { hasText: "Appliance" })).toHaveText("Appliance Hallway smoke alarm");
  await expect(closed.locator(".warn")).toContainText("Done");
  await expect(closed.locator("#done")).toHaveCount(0);
  await expect(closed.locator(".say")).toHaveCount(0);

  const done = await taskSkin(page);
  expect(done.chipBg).toBe("rgb(213, 243, 223)");
  expect(done.chipColor).toBe("rgb(11, 112, 57)");
  expect(done.bodyBg).toBe("rgba(0, 0, 0, 0)");
  expect(done.labelTransform).toBe("uppercase");

  await expectCardFits(page);
  await expectNoSeriousAxe(page);
  await page.screenshot({ path: "docs/screens/rc4/a5-1280-task-done.png" });

  await page.setViewportSize({ width: 390, height: 800 });
  await expect(closed.locator(".warn")).toContainText("Done");
  await expect(closed.locator(".label", { hasText: "Next due" })).toBeVisible();
  await expectCardFits(page);
  await expectNoSeriousAxe(page);
  await page.locator("iframe.card-frame").evaluate((node) => node.scrollIntoView({ block: "center", inline: "nearest" }));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))));
  await page.screenshot({ path: "docs/screens/rc4/a5-390-task-done.png", fullPage: true });
});
