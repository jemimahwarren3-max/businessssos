import { test, expect } from "@playwright/test";

test.describe("security: unauthenticated access", () => {
  const protectedRoutes = [
    "/dashboard",
    "/inventory",
    "/sales",
    "/customers",
    "/invoices",
    "/expenses",
    "/settings/billing",
    "/settings/team",
    "/reports",
  ];

  for (const route of protectedRoutes) {
    test(`${route} redirects to /auth when unauthenticated`, async ({ page }) => {
      await page.goto(route);
      await page.waitForURL(/\/auth/, { timeout: 15_000 });
      await expect(page).toHaveURL(/\/auth/);
    });
  }
});

test.describe("security: admin routes", () => {
  test("admin index returns not-found for non-admin users", async ({ page }) => {
    const response = await page.goto("/admin");
    const status = response?.status() ?? 0;
    const hasNotFound = await page
      .getByText(/not found|404|page.*exist/i)
      .isVisible()
      .catch(() => false);
    const isOnAuth = page.url().includes("/auth");
    expect(status === 404 || hasNotFound || isOnAuth).toBe(true);
  });
});

test.describe("security: direct API exploration", () => {
  test("health endpoint is public and returns 200", async ({ request }) => {
    const response = await request.get("/health");
    expect(response.status()).toBe(200);
  });
});
