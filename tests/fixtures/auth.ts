import { existsSync } from "node:fs";
import { test as base, expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import path from "node:path";

const authDir = path.join(import.meta.dirname, "..", "..", "e2e", ".auth");

type RoleName = "merchant-a" | "merchant-b" | "customer-a" | "customer-b";
const roleEnvPrefix: Record<RoleName, string> = {
  "merchant-a": "E2E_MERCHANT_A",
  "merchant-b": "E2E_MERCHANT_B",
  "customer-a": "E2E_CUSTOMER_A",
  "customer-b": "E2E_CUSTOMER_B",
};

type LaunchFixtures = {
  merchantAPage: Page;
  merchantBPage: Page;
  customerAPage: Page;
  customerBPage: Page;
  guestPage: Page;
};

function contextOptions(testInfo: TestInfo, storageState: string | { cookies: []; origins: [] }) {
  const projectUse = testInfo.project.use;
  return {
    baseURL: process.env["E2E_BASE_URL"]?.trim() || "http://127.0.0.1:8080",
    storageState,
    ...(projectUse.viewport ? { viewport: projectUse.viewport } : {}),
    ...(typeof projectUse.deviceScaleFactor === "number"
      ? { deviceScaleFactor: projectUse.deviceScaleFactor }
      : {}),
    ...(projectUse.isMobile === true ? { isMobile: true } : {}),
    ...(projectUse.hasTouch === true ? { hasTouch: true } : {}),
  };
}

async function createRolePage(
  browser: Browser,
  providePage: (page: Page) => Promise<void>,
  role: RoleName,
  testInfo: TestInfo,
) {
  const prefix = roleEnvPrefix[role];
  if (!process.env[`${prefix}_EMAIL`] || !process.env[`${prefix}_PASSWORD`]) {
    testInfo.skip(true, `${prefix}_EMAIL and ${prefix}_PASSWORD are required`);
    return;
  }
  const storageState = path.join(authDir, `${role}.json`);
  if (!existsSync(storageState)) {
    throw new Error(`Missing ${role} auth state; the Playwright auth setup did not save it`);
  }
  const context = await browser.newContext(contextOptions(testInfo, storageState));
  try {
    await providePage(await context.newPage());
  } finally {
    await context.close();
  }
}

async function createGuestPage(
  browser: Browser,
  providePage: (page: Page) => Promise<void>,
  testInfo: TestInfo,
) {
  const context = await browser.newContext(contextOptions(testInfo, { cookies: [], origins: [] }));
  try {
    await providePage(await context.newPage());
  } finally {
    await context.close();
  }
}

export const test = base.extend<LaunchFixtures>({
  merchantAPage: async ({ browser }, providePage, testInfo) =>
    createRolePage(browser, providePage, "merchant-a", testInfo),
  merchantBPage: async ({ browser }, providePage, testInfo) =>
    createRolePage(browser, providePage, "merchant-b", testInfo),
  customerAPage: async ({ browser }, providePage, testInfo) =>
    createRolePage(browser, providePage, "customer-a", testInfo),
  customerBPage: async ({ browser }, providePage, testInfo) =>
    createRolePage(browser, providePage, "customer-b", testInfo),
  guestPage: async ({ browser }, providePage, testInfo) =>
    createGuestPage(browser, providePage, testInfo),
});

export { expect };
