import { test } from "./fixtures";

const skip = !process.env.E2E_OWNER_EMAIL;

const pages = [
  { name: "dashboard", path: "/dashboard" },
  { name: "setup", path: "/setup" },
  { name: "inventory", path: "/inventory" },
  { name: "sales", path: "/sales" },
  { name: "sale-history", path: "/sale-history" },
  { name: "cash-drawer", path: "/cash-drawer" },
  { name: "customers", path: "/customers" },
  { name: "expenses", path: "/expenses" },
  { name: "invoices", path: "/invoices" },
  { name: "reports", path: "/reports" },
  { name: "settings-account", path: "/settings/account" },
  { name: "settings-team", path: "/settings/team" },
  { name: "settings-billing", path: "/settings/billing" },
];

test.describe("visual audit", () => {
  test.skip(skip, "E2E_OWNER_EMAIL not set");

  for (const p of pages) {
    test(`screenshot ${p.name}`, async ({ page }) => {
      await page.goto(p.path);
      await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 15_000 });
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(2_000);
      await page.screenshot({ path: `test-results/audit-${p.name}.png`, fullPage: true });
    });
  }
});
