import { test, expect } from "@playwright/test";

test.describe("authentication", () => {
  test("login page renders sign-in form", async ({ page }) => {
    await page.goto("/auth?mode=signin");
    await expect(page.locator("#email")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#password")).toBeVisible();
  });

  test("login with invalid credentials shows error", async ({ page }) => {
    await page.goto("/auth?mode=signin");
    await page.locator("#email").waitFor({ timeout: 30_000 });
    await page.locator("#email").fill("nonexistent@example.com");
    await page.locator("#password").fill("wrongpassword123");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page.getByText(/incorrect email or password/i)).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/auth/);
  });

  test("signup page renders create account form", async ({ page }) => {
    await page.goto("/auth?mode=signup");
    await expect(page.locator("#fullName")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
  });

  test("password reset form renders", async ({ page }) => {
    await page.goto("/auth?mode=reset");
    await expect(page.locator("#email")).toBeVisible({ timeout: 30_000 });
  });

  test("unauthenticated user visiting /dashboard ends up on /auth", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL(/\/auth/, { timeout: 30_000 });
    await expect(page).toHaveURL(/\/auth/);
  });

  test("unauthenticated user visiting /inventory ends up on /auth", async ({ page }) => {
    await page.goto("/inventory");
    await page.waitForURL(/\/auth/, { timeout: 30_000 });
    await expect(page).toHaveURL(/\/auth/);
  });

  test("staff login page renders two-stage form", async ({ page }) => {
    await page.goto("/staff-login");
    await expect(page.getByLabel(/business name/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("input")).toHaveCount(2);
  });
});
