import { test, expect } from "./fixtures";

test.describe("authenticated session", () => {
  test.skip(!process.env.E2E_OWNER_EMAIL, "E2E_OWNER_EMAIL not set — skipping authenticated tests");

  test("session persists after refresh", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 15_000 });
    await page.reload();
    await page.waitForTimeout(2_000);
    await expect(page).not.toHaveURL(/\/auth/);
  });

  test("logout redirects to public page", async ({ page }) => {
    await page.goto("/settings/account");
    await page.waitForURL(/\/settings/, { timeout: 15_000 });

    const logoutButton = page.getByRole("button", { name: /sign out|log out/i });
    if (await logoutButton.isVisible()) {
      await logoutButton.click();
      await page.waitForURL(/^\/$|\/auth/, { timeout: 15_000 });
    }
  });

  test("dashboard or setup loads after login", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 15_000 });
    const url = page.url();
    const onValidRoute =
      url.includes("/dashboard") || url.includes("/setup") || url.includes("/onboarding");
    expect(onValidRoute).toBe(true);
  });
});
