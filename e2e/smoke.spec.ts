import { test, expect } from "@playwright/test";

/**
 * Smoke tests against deployed staging/production (E2E_BASE_URL).
 * These do not create orders or mutate data.
 */
test.describe("public smoke", () => {
  test("home page loads", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator("body")).toBeVisible();
  });

  test("marketplace browse loads", async ({ page }) => {
    const response = await page.goto("/market");
    expect(response?.status()).toBeLessThan(400);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("auth page loads", async ({ page }) => {
    const response = await page.goto("/auth");
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator("body")).toContainText(/sign|google|account/i);
  });
});
