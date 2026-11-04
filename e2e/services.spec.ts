import { test, expect } from "./fixtures";

const skip = !process.env.E2E_OWNER_EMAIL;

test.describe("service and hybrid commerce", () => {
  test.skip(skip, "E2E_OWNER_EMAIL not set");

  test("services page loads", async ({ page }) => {
    await page.goto("/services");
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 15_000 });
    const heading = page.getByRole("heading", { name: /services/i });
    await expect(heading).toBeVisible({ timeout: 15_000 });
  });

  test("bookings page loads", async ({ page }) => {
    await page.goto("/bookings");
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 15_000 });
    const heading = page.getByRole("heading", { name: /bookings/i });
    await expect(heading).toBeVisible({ timeout: 15_000 });
  });

  test("business settings include commerce model", async ({ page }) => {
    await page.goto("/settings/business");
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 15_000 });
    await expect(page.getByText(/product-based|what you sell/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
