import { test } from "@playwright/test";

test("screenshot marketplace", async ({ page }) => {
  await page.goto("/market");
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(2_000);
  await page.screenshot({ path: "test-results/store-marketplace.png", fullPage: true });
});

test("screenshot live store by clicking shop card", async ({ page }) => {
  await page.goto("/market");
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(1_000);

  const shopCard = page.locator('a[href*="/store/"]').first();
  if (!(await shopCard.isVisible({ timeout: 5_000 }).catch(() => false))) {
    test.skip(true, "Payment Safety Shop not found");
    return;
  }
  await shopCard.click();
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(2_000);
  await page.screenshot({ path: "test-results/store-live-shop.png", fullPage: true });
});

test("screenshot stores directory", async ({ page }) => {
  await page.goto("/stores");
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(2_000);
  await page.screenshot({ path: "test-results/store-directory.png", fullPage: true });
});
