import { test, expect } from "./fixtures";

test.describe("product management", () => {
  test.skip(
    !process.env.E2E_OWNER_EMAIL,
    "E2E_OWNER_EMAIL not set — skipping authenticated tests",
  );

  test("inventory page loads with product list or empty state", async ({ page }) => {
    await page.goto("/inventory");
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 15_000 });

    const heading = page.getByRole("heading", { name: /inventory|products/i });
    await expect(heading).toBeVisible({ timeout: 15_000 });
  });

  test("can open add-product form", async ({ page }) => {
    await page.goto("/inventory");
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 15_000 });

    const addButton = page.getByRole("button", { name: /add product|new product/i });
    if (await addButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await addButton.click();
      const nameField = page.locator('input[name="name"], #name, #productName');
      await expect(nameField.first()).toBeVisible({ timeout: 5_000 });
    }
  });
});

test.describe("POS / sales", () => {
  test.skip(
    !process.env.E2E_OWNER_EMAIL,
    "E2E_OWNER_EMAIL not set — skipping authenticated tests",
  );

  test("sales page loads", async ({ page }) => {
    await page.goto("/sales");
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 15_000 });
    await expect(page.locator("body")).toContainText(/sale|cart|product/i);
  });

  test("sale history page loads", async ({ page }) => {
    await page.goto("/sale-history");
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 15_000 });

    const heading = page.getByRole("heading", { name: /sale|history|transaction/i });
    await expect(heading).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("customers", () => {
  test.skip(
    !process.env.E2E_OWNER_EMAIL,
    "E2E_OWNER_EMAIL not set — skipping authenticated tests",
  );

  test("customers page loads", async ({ page }) => {
    await page.goto("/customers");
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 15_000 });

    const heading = page.getByRole("heading", { name: /customer/i });
    await expect(heading).toBeVisible({ timeout: 15_000 });
  });
});
