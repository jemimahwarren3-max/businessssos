import { test, expect } from "@playwright/test";
import path from "node:path";

const authDir = path.join(import.meta.dirname, ".auth");

test.describe("data imports", () => {
  test.use({ storageState: path.join(authDir, "owner.json") });

  test.beforeEach(() => {
    if (!process.env.E2E_OWNER_EMAIL || !process.env.E2E_OWNER_PASSWORD) {
      test.skip(true, "E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD are required");
    }
  });

  test("inventory import dialog opens and accepts a CSV header row", async ({ page }) => {
    await page.goto("/inventory");
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 30_000 });

    const importButton = page.getByRole("button", { name: /^import$/i });
    if (!(await importButton.isVisible().catch(() => false))) {
      test.skip(true, "This account cannot import products.");
      return;
    }
    await importButton.click();
    await expect(page.getByRole("heading", { name: /import products/i })).toBeVisible();

    const csv = "name,sku,stock,selling_price\nTest SKU item,SKU-1,5,10\n";
    const file = {
      name: "products.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    };
    await page.locator('input[type="file"]').setInputFiles(file);
    await expect(page.getByText(/test sku item|ready to import|row/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("reports sales import dialog warns on empty file", async ({ page }) => {
    await page.goto("/reports");
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 30_000 });

    const importPast = page.getByRole("button", { name: /import past sales|import sales/i });
    if (
      !(await importPast
        .first()
        .isVisible()
        .catch(() => false))
    ) {
      test.skip(true, "This account cannot import sales history.");
      return;
    }
    await importPast.first().click();
    await expect(page.getByRole("heading", { name: /import/i })).toBeVisible();
    const emptyCsv = "date,total\n";
    await page.locator('input[type="file"]').setInputFiles({
      name: "sales.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(emptyCsv),
    });
    await expect(page.getByText(/no rows|missing|required/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
