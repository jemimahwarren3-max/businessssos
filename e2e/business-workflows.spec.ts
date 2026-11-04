import { test, expect, pageHeading } from "./fixtures";

const skip = !process.env.E2E_OWNER_EMAIL;

test.describe("product management", () => {
  test.skip(skip, "E2E_OWNER_EMAIL not set");

  test("inventory page loads with product list or empty state", async ({ page }) => {
    await page.goto("/inventory");
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 15_000 });

    await expect(pageHeading(page, /inventory|products/i)).toBeVisible({ timeout: 15_000 });
  });

  test("can open and fill add-product form", async ({ page }) => {
    await page.goto("/inventory");
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 15_000 });

    const addButton = page.getByRole("button", { name: /add product/i });
    if (!(await addButton.isVisible({ timeout: 10_000 }).catch(() => false))) {
      test.skip(true, "Add product button not visible (billing locked or role restricted)");
      return;
    }
    await addButton.click();

    await expect(page.getByRole("heading", { name: /add a product/i })).toBeVisible({
      timeout: 5_000,
    });

    const nameInput = page.getByLabel(/product name/i);
    await nameInput.fill(`E2E Test Product ${Date.now()}`);

    const costInput = page.getByLabel(/cost price/i);
    if (await costInput.isVisible().catch(() => false)) {
      await costInput.fill("10");
    }

    const sellingInput = page.getByLabel(/selling price/i);
    if (await sellingInput.isVisible().catch(() => false)) {
      await sellingInput.fill("20");
    }

    const stockInput = page.getByLabel(/^stock$/i);
    if (await stockInput.isVisible().catch(() => false)) {
      await stockInput.fill("50");
    }

    const saveButton = page.getByRole("button", { name: /save|add|create/i }).last();
    await expect(saveButton).toBeEnabled();
  });
});

test.describe("POS / sales", () => {
  test.skip(skip, "E2E_OWNER_EMAIL not set");

  test("sales page loads with POS interface", async ({ page }) => {
    await page.goto("/sales");
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 15_000 });

    const heading = pageHeading(page, /sales/i);
    await expect(heading).toBeVisible({ timeout: 15_000 });
  });

  test("sale history page loads", async ({ page }) => {
    await page.goto("/sale-history");
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 15_000 });

    await expect(pageHeading(page, /sales history|history/i)).toBeVisible({ timeout: 15_000 });
  });

  test("cash drawer page loads", async ({ page }) => {
    await page.goto("/cash-drawer");
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 15_000 });
    await expect(page.locator("body")).toContainText(/cash drawer|drawer|float/i);
  });
});

test.describe("customers", () => {
  test.skip(skip, "E2E_OWNER_EMAIL not set");

  test("customers page loads", async ({ page }) => {
    await page.goto("/customers");
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 15_000 });

    await expect(pageHeading(page, /customers/i)).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("other authenticated pages", () => {
  test.skip(skip, "E2E_OWNER_EMAIL not set");

  test("expenses page loads", async ({ page }) => {
    await page.goto("/expenses");
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 15_000 });
    await expect(pageHeading(page, /expenses/i)).toBeVisible({ timeout: 15_000 });
  });

  test("invoices page loads", async ({ page }) => {
    await page.goto("/invoices");
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 15_000 });
    await expect(pageHeading(page, /invoices/i)).toBeVisible({ timeout: 15_000 });
  });

  test("reports page loads", async ({ page }) => {
    await page.goto("/reports");
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 15_000 });
    await expect(pageHeading(page, /reports/i)).toBeVisible({ timeout: 15_000 });
  });

  test("settings account page loads", async ({ page }) => {
    await page.goto("/settings/account");
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 15_000 });
    await expect(page.locator("body")).toContainText(/account|profile|email/i);
  });

  test("team settings page loads", async ({ page }) => {
    await page.goto("/settings/team");
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 15_000 });
    await expect(page.locator("body")).toContainText(/team|member|invite/i);
  });
});
