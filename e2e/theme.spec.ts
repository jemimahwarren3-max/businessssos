import { expect, test } from "@playwright/test";

test.describe("theme preference", () => {
  test("toggles dark mode and persists on a public route", async ({ page }) => {
    await page.goto("/auth");
    const toggle = page.getByRole("button", { name: "Switch to dark mode" });
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect.poll(() => page.evaluate(() => localStorage.getItem("kwetuu-theme"))).toBe("dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("button", { name: "Switch to light mode" })).toBeVisible();
  });

  test("app shell toggle persists when a test merchant is configured", async ({ page }) => {
    const email = process.env["E2E_OWNER_EMAIL"];
    const password = process.env["E2E_OWNER_PASSWORD"];
    if (!email || !password) {
      test.skip(true, "E2E_OWNER credentials are required for an app-shell test");
      return;
    }

    await page.goto("/auth?mode=signin");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 30_000 });

    const toggle = page.getByRole("button", { name: "Switch to dark mode" });
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("kwetuu-theme"))).toBe("dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
});
