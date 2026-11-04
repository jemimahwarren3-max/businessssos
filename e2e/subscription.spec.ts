import { test, expect, pageHeading } from "./fixtures";

test.describe("subscription and billing", () => {
  test.skip(!process.env.E2E_OWNER_EMAIL, "E2E_OWNER_EMAIL not set, skipping authenticated tests");

  test("billing settings page loads", async ({ page }) => {
    await page.goto("/settings/billing");
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 15_000 });

    await expect(page.locator("body")).toContainText(/billing|subscription|plan/i);
  });

  test("billing page shows plan details or trial status", async ({ page }) => {
    await page.goto("/settings/billing");
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 15_000 });

    await expect(pageHeading(page, /billing/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).toContainText(/billing|subscription|plan|trial/i);
  });
});
