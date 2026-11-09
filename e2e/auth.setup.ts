import { test as setup, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const authDir = path.join(import.meta.dirname, ".auth");

async function authenticate(page: Page, email: string, password: string, file: string) {
  await mkdir(authDir, { recursive: true });
  await page.goto("/auth?mode=signin");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();

  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 30_000 });

  await page.context().storageState({ path: path.join(authDir, file) });
}

setup("authenticate test owner", async ({ page }) => {
  const email = process.env.E2E_OWNER_EMAIL;
  const password = process.env.E2E_OWNER_PASSWORD;
  if (!email || !password) {
    setup.skip(true, "E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD are required");
    return;
  }
  await authenticate(page, email, password, "owner.json");
});

for (const role of [
  { file: "cashier", prefix: "CASHIER" },
  { file: "stock_assistant", prefix: "STOCK" },
] as const) {
  setup(`authenticate ${role.file}`, async ({ page }) => {
    const email = process.env[`E2E_${role.prefix}_EMAIL`];
    const password = process.env[`E2E_${role.prefix}_PASSWORD`];
    if (!email || !password) {
      setup.skip(true, `E2E_${role.prefix}_EMAIL and E2E_${role.prefix}_PASSWORD are required`);
      return;
    }
    await authenticate(page, email, password, `${role.file}.json`);
  });
}

for (const role of ["merchant-a", "merchant-b", "customer-a", "customer-b"] as const) {
  const prefix = role.replace("-", "_").toUpperCase();
  setup(`authenticate ${role}`, async ({ page }) => {
    const email = process.env[`E2E_${prefix}_EMAIL`];
    const password = process.env[`E2E_${prefix}_PASSWORD`];
    if (!email || !password) {
      setup.skip(true, `E2E_${prefix}_EMAIL and E2E_${prefix}_PASSWORD are required`);
      return;
    }
    await authenticate(page, email, password, `${role}.json`);
  });
}
