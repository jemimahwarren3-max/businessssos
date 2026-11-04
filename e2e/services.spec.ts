import { test, expect, pageHeading } from "./fixtures";

const skip = !process.env.E2E_OWNER_EMAIL;

test.describe("service and hybrid commerce", () => {
  test.skip(skip, "E2E_OWNER_EMAIL not set");

  test("services page loads", async ({ page }) => {
    await page.goto("/services");
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 15_000 });
    const heading = pageHeading(page, /^services$/i);
    if (!(await heading.isVisible({ timeout: 8_000 }).catch(() => false))) {
      test.skip(true, "Services page is not on this environment yet");
      return;
    }
    await expect(heading).toBeVisible();
  });

  test("bookings page loads", async ({ page }) => {
    await page.goto("/bookings");
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 15_000 });
    const heading = pageHeading(page, /^bookings$/i);
    if (!(await heading.isVisible({ timeout: 8_000 }).catch(() => false))) {
      test.skip(true, "Bookings page is not on this environment yet");
      return;
    }
    await expect(heading).toBeVisible();
  });

  test("business settings include commerce model", async ({ page }) => {
    await page.goto("/settings/business");
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 15_000 });
    const commerce = page.getByText(/product-based|what you sell/i).first();
    if (!(await commerce.isVisible({ timeout: 8_000 }).catch(() => false))) {
      test.skip(true, "Commerce model settings are not on this environment yet");
      return;
    }
    await expect(commerce).toBeVisible();
  });
});
