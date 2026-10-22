/**
 * P-14: the About dialog shows the MIT license on its own line.
 * Household copy elsewhere on the page is fictional sample data.
 */
import { expect, test } from "./support";

test("About dialog shows License: MIT on its own line", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByRole("button", { name: "About" }).click();
  const dialog = page.getByRole("dialog", { name: "About this simulation" });
  await expect(dialog).toBeVisible();
  const license = dialog.locator("#about-license");
  await expect(license).toBeVisible();
  await expect(license).toHaveText("License: MIT");
  const tag = await license.evaluate((node) => node.tagName);
  expect(tag).toBe("P");
  const ownLine = await license.evaluate((node) => {
    const style = getComputedStyle(node);
    return style.display !== "inline" && style.display !== "inline-block";
  });
  expect(ownLine).toBe(true);
});
