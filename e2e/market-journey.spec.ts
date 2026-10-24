import { test, expect } from "@playwright/test";

/**
 * Read-only marketplace journey — proves discovery wiring without auth or checkout.
 */
test.describe("marketplace journey", () => {
  test("browse market and open a listed shop when any exist", async ({ page }) => {
    await page.goto("/market");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const empty = page.getByRole("heading", { name: /No shops are listed yet/i });
    if (await empty.isVisible()) {
      await expect(empty).toBeVisible();
      return;
    }

    const shopsSection = page.locator("section").filter({ has: page.getByRole("heading", { name: "Shops" }) });
    const shopLink = shopsSection.locator("a[href]").first();
    await expect(shopLink).toBeVisible({ timeout: 15_000 });
    const href = await shopLink.getAttribute("href");
    expect(href).toBeTruthy();

    const response = await page.goto(href!);
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator("body")).toBeVisible();
  });
});
