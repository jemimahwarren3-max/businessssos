import { test as setup } from "@playwright/test";
import path from "node:path";

const authDir = path.join(import.meta.dirname, ".auth");

setup("authenticate test owner", async ({ page }) => {
  const email = process.env.E2E_OWNER_EMAIL;
  const password = process.env.E2E_OWNER_PASSWORD;

  if (!email || !password) {
    console.log("E2E_OWNER_EMAIL / E2E_OWNER_PASSWORD not set, skipping auth setup");
    return;
  }

  await page.goto("/auth?mode=signin");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();

  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 30_000 });

  await page.context().storageState({ path: path.join(authDir, "owner.json") });
});
