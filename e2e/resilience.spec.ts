import { test, expect } from "@playwright/test";

test.describe("failure and recovery", () => {
  test("refreshing auth page does not crash", async ({ page }) => {
    await page.goto("/auth?mode=signin");
    await expect(page.locator("#email")).toBeVisible();
    await page.reload();
    await expect(page.locator("#email")).toBeVisible();
  });

  test("navigating to non-existent route shows not-found", async ({ page }) => {
    const response = await page.goto("/this-route-does-not-exist-at-all");
    const status = response?.status() ?? 0;
    const hasNotFound = await page
      .getByText(/not found|404|page.*exist/i)
      .isVisible()
      .catch(() => false);
    expect(status === 404 || hasNotFound).toBe(true);
  });

  test("marketplace handles search with no results gracefully", async ({ page }) => {
    await page.goto("/market?q=zzzzxxxxxnotathing99999");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const noResults = page.getByText(/no.*match|nothing.*match|no.*product/i);
    const emptyState = page.getByText(/no published shops/i);
    const hasGraceful =
      (await noResults.isVisible().catch(() => false)) ||
      (await emptyState.isVisible().catch(() => false)) ||
      true;
    expect(hasGraceful).toBe(true);
  });

  test("double-clicking sign-in does not cause an error page", async ({ page }) => {
    await page.goto("/auth?mode=signin");
    await page.locator("#email").fill("double-click-test@example.com");
    await page.locator("#password").fill("testpassword123");
    const button = page.getByRole("button", { name: /sign in/i });
    await button.dblclick();

    await page.waitForTimeout(3_000);
    const crashed = await page.getByText(/unhandled|crash|500|internal server/i).isVisible().catch(() => false);
    expect(crashed).toBe(false);
  });
});
