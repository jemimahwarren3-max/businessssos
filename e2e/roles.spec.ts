import { test, expect } from "@playwright/test";
import path from "node:path";

const authDir = path.join(import.meta.dirname, ".auth");

type RoleCase = {
  name: string;
  storage: string;
  envPrefix: string;
  expectNav: RegExp;
  denyNav: RegExp[];
  blockedPath: string;
};

const ROLE_CASES: RoleCase[] = [
  {
    name: "owner",
    storage: "owner.json",
    envPrefix: "OWNER",
    expectNav: /sales/i,
    denyNav: [],
    blockedPath: "/sales",
  },
  {
    name: "cashier",
    storage: "cashier.json",
    envPrefix: "CASHIER",
    expectNav: /sales/i,
    denyNav: [/reports/i, /team/i],
    blockedPath: "/reports",
  },
  {
    name: "stock assistant",
    storage: "stock_assistant.json",
    envPrefix: "STOCK",
    expectNav: /products|inventory/i,
    denyNav: [/sales/i, /expenses/i, /reports/i],
    blockedPath: "/sales",
  },
];

for (const roleCase of ROLE_CASES) {
  test.describe(`${roleCase.name} role`, () => {
    test.use({ storageState: path.join(authDir, roleCase.storage) });

    test.beforeEach(() => {
      const email = process.env[`E2E_${roleCase.envPrefix}_EMAIL`];
      const password = process.env[`E2E_${roleCase.envPrefix}_PASSWORD`];
      if (!email || !password) {
        test.skip(
          true,
          `E2E_${roleCase.envPrefix}_EMAIL and E2E_${roleCase.envPrefix}_PASSWORD are required`,
        );
      }
    });

    test("shows permitted navigation and hides restricted links", async ({ page }) => {
      await page.goto("/dashboard");
      await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 30_000 });

      const nav = page.getByRole("navigation", { name: /main/i });
      await expect(nav.getByRole("link", { name: roleCase.expectNav }).first()).toBeVisible();
      for (const pattern of roleCase.denyNav) {
        await expect(nav.getByRole("link", { name: pattern })).toHaveCount(0);
      }
    });

    test("blocked route does not expose primary action", async ({ page }) => {
      await page.goto(roleCase.blockedPath);
      await page.waitForTimeout(1_500);
      const recordSale = page.getByRole("button", {
        name: /record sale|charge|open the cash drawer/i,
      });
      if (roleCase.name === "owner" || roleCase.name === "cashier") {
        await expect(recordSale.first()).toBeVisible({ timeout: 5_000 });
        return;
      }
      await expect(recordSale).toHaveCount(0);
      const denied = page.getByText(/permission|not allow|couldn.t open|access/i);
      const redirected = !page.url().includes(roleCase.blockedPath);
      expect(
        redirected ||
          (await denied
            .first()
            .isVisible()
            .catch(() => false)),
      ).toBe(true);
    });
  });
}
