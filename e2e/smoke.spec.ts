import { test, expect } from "@playwright/test";

/**
 * Read-only smoke checks against the local production preview.
 */
test.describe("public smoke", () => {
  test("home and authentication routes have no uncaught browser errors", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    for (const path of ["/", "/auth", "/staff-login"]) {
      const response = await page.goto(path);
      expect(response?.status()).toBeLessThan(400);
      await expect(page.locator("body")).toBeVisible();
    }

    expect(pageErrors).toEqual([]);
  });

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

  test("staff login page loads", async ({ page }) => {
    const response = await page.goto("/staff-login");
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator("body")).toBeVisible();
  });
});
