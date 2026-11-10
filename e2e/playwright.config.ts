import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const baseURL = process.env.E2E_BASE_URL?.trim() || "http://127.0.0.1:8080";
const baseUrl = new URL(baseURL);
if (!["localhost", "127.0.0.1", "::1"].includes(baseUrl.hostname)) {
  throw new Error("Playwright must target the local production preview, never a deployed site.");
}
const port = baseUrl.port || "8080";
const repoRoot = path.resolve(import.meta.dirname, "..");
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const rootPath = escapeRegex(repoRoot);
const authDir = path.join(import.meta.dirname, ".auth");

export default defineConfig({
  testDir: repoRoot,
  testMatch: new RegExp(`^${rootPath}[\\\\/](?:e2e|tests)[\\\\/].*\\.spec\\.ts$`),
  testIgnore: ["**/node_modules/**"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "auth-setup",
      testMatch: new RegExp(`^${rootPath}[\\\\/]e2e[\\\\/]auth\\.setup\\.ts$`),
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 720 } },
      dependencies: ["auth-setup"],
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 5"], viewport: { width: 390, height: 844 } },
      dependencies: ["auth-setup"],
    },
    {
      name: "smoke",
      testMatch: new RegExp(`^${rootPath}[\\\\/]e2e[\\\\/]smoke\\.spec\\.ts$`),
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  outputDir: path.join(import.meta.dirname, "..", "test-results"),
  webServer: {
    command: "node .output/server/index.mjs",
    cwd: repoRoot,
    url: baseURL,
    env: {
      HOST: baseUrl.hostname,
      PORT: port,
      NITRO_HOST: baseUrl.hostname,
      NITRO_PORT: port,
      APP_URL: process.env.APP_URL ?? baseURL,
      SHOP_HOSTS: process.env.SHOP_HOSTS ?? "true",
      SESSION_SECRET: process.env.SESSION_SECRET ?? "",
      SUPABASE_URL: process.env.SUPABASE_URL ?? "",
      SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY ?? "",
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

export { authDir };
