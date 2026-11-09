import { test, expect } from "@playwright/test";

test.describe("storefront public experience", () => {
  test("marketplace loads and shows shops heading", async ({ page }) => {
    await page.goto("/market");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("body")).toContainText(/shop|find/i);
  });

  test("stores directory page loads", async ({ page }) => {
    const response = await page.goto("/stores");
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator("body")).toBeVisible();
  });

  test("visiting a non-existent store slug returns 404 or not-found", async ({ page }) => {
    const response = await page.goto("/store/definitely-not-a-real-store-xyz");
    const status = response?.status() ?? 0;
    const is404 = status === 404 || status >= 400;
    const hasNotFound = await page
      .getByText(/not found|doesn't exist|no shop|isn't live|page not found/i)
      .first()
      .isVisible()
      .catch(() => false);
    // Production shop-host rewrite sends unknown slugs to `{slug}.host`, then
    // home. That is still "this shop is not here", not a real storefront.
    const bouncedHome = new URL(page.url()).pathname === "/";
    expect(is404 || hasNotFound || bouncedHome).toBe(true);
  });

  test("can browse a listed shop if any exist", async ({ page }) => {
    await page.goto("/market");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const emptyState = page.getByText(/no published shops|no shops/i);
    if (await emptyState.isVisible().catch(() => false)) {
      return;
    }

    const shopLink = page.locator('a[href*="/store/"]').first();
    if (await shopLink.isVisible({ timeout: 10_000 }).catch(() => false)) {
      const href = await shopLink.getAttribute("href");
      expect(href).toBeTruthy();
      const response = await page.goto(href!);
      expect(response?.status()).toBeLessThan(400);
    }
  });

  test("store cart page loads (empty cart)", async ({ page }) => {
    await page.goto("/market");
    const shopLink = page.locator('a[href*="/store/"]').first();
    if (!(await shopLink.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, "No published shops to test cart on");
      return;
    }

    const href = await shopLink.getAttribute("href");
    const slug = href?.match(/\/store\/([^/]+)/)?.[1];
    if (!slug) return;

    await page.goto(`/store/${slug}/cart`);
    await expect(page.getByText(/cart/i)).toBeVisible();
    await expect(page.getByText(/empty/i)).toBeVisible();
  });
});
