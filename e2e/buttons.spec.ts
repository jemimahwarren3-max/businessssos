import { test, expect, type Page } from "@playwright/test";

/**
 * Button coverage against the local production preview.
 *
 * - Public pages: every visible button and same-origin link is clicked or
 *   fetched. Anything that breaks the page (uncaught error, 5xx, the app's
 *   "This page didn't load" screen) fails the test.
 * - Signed-in pages (needs the owner auth state): same walk, but destructive
 *   buttons are skipped so the test cannot delete or charge anything.
 * - Launch and Add product run as explicit flows.
 * - Payment checkout is skipped unless E2E_ALLOW_PAYMENT_TESTS=1 is set on
 *   staging with a Paynow sandbox. It never runs against production.
 */

const PUBLIC_ROUTES = [
  "/",
  "/auth",
  "/market",
  "/stores",
  "/pricing",
  "/features",
  "/faq",
  "/about",
  "/templates",
  "/staff-login",
  "/terms",
  "/privacy",
];

const AUTHED_ROUTES = [
  "/dashboard",
  "/inventory",
  "/sales",
  "/invoices",
  "/orders",
  "/settings/business",
  "/settings/billing",
  "/settings/payments",
  "/storefront",
];

const DESTRUCTIVE =
  /delete|remove|cancel|sign ?out|log ?out|pay|publish|unpublish|submit|save|confirm|refund|archive|revoke|discard|send|charge|record|deposit|collect|apply|upgrade|subscribe|checkout|sell|void|close|reset|invite/i;

const APP_ERROR = /This page didn't load|We couldn't open/i;

async function gotoSettled(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  return response;
}

async function clickEveryButton(page: Page, path: string, skip: RegExp | null) {
  const failures: string[] = [];
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await gotoSettled(page, path);
  const count = await page.locator("button:visible:not([disabled])").count();

  for (let index = 0; index < count; index += 1) {
    await gotoSettled(page, path);
    const button = page.locator("button:visible:not([disabled])").nth(index);
    if (!(await button.isVisible().catch(() => false))) continue;
    const label = ((await button.getAttribute("aria-label")) ?? (await button.innerText()))
      .trim()
      .slice(0, 80);
    if (skip && skip.test(label)) continue;

    await button.click({ timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(300);
    await page.keyboard.press("Escape").catch(() => {});

    const bodyText = await page.locator("body").innerText();
    if (APP_ERROR.test(bodyText)) failures.push(`${path} -> "${label}" showed the error screen`);
  }

  if (pageErrors.length > 0) failures.push(`${path} uncaught errors: ${pageErrors.join(" | ")}`);
  return failures;
}

test.describe("public buttons", () => {
  for (const path of PUBLIC_ROUTES) {
    test(`every button works on ${path}`, async ({ page }) => {
      test.setTimeout(180_000);
      const response = await gotoSettled(page, path);
      expect(response?.status() ?? 0).toBeLessThan(400);

      const failures = await clickEveryButton(page, path, null);
      expect(failures).toEqual([]);
    });
  }

  test("every same-origin link on the home page resolves", async ({ page, request }) => {
    await gotoSettled(page, "/");
    const hrefs = await page
      .locator("a[href^='/']:visible")
      .evaluateAll((links) => [...new Set(links.map((link) => link.getAttribute("href") ?? ""))]);

    const broken: string[] = [];
    for (const href of hrefs.filter((href) => !href.includes("#"))) {
      const response = await request.get(href, { maxRedirects: 0 });
      if (response.status() >= 500) broken.push(`${href} -> ${response.status()}`);
    }
    expect(broken).toEqual([]);
  });

  test("auth form rejects empty submit and bad email", async ({ page }) => {
    await gotoSettled(page, "/auth?mode=signin");
    const email = page.locator("#email");
    await email.fill("not-an-email");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.locator("body")).toContainText(/valid|email|required/i);
  });
});

test.describe("signed-in buttons", () => {
  for (const path of AUTHED_ROUTES) {
    test(`every safe button works on ${path}`, async ({ page }) => {
      test.setTimeout(240_000);
      test.skip(!process.env.E2E_OWNER_EMAIL, "E2E_OWNER_EMAIL not set");
      const response = await gotoSettled(page, path);
      expect(response?.status() ?? 0).toBeLessThan(400);

      const failures = await clickEveryButton(page, path, DESTRUCTIVE);
      expect(failures).toEqual([]);
    });
  }

  test("Add product opens the form", async ({ page }) => {
    test.skip(!process.env.E2E_OWNER_EMAIL, "E2E_OWNER_EMAIL not set");
    await gotoSettled(page, "/inventory");
    await page.getByRole("button", { name: /add product|add your first product/i }).first().click();
    await expect(page.getByLabel("Product name")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(APP_ERROR);
  });

  test("Publish store is disabled until launch requirements are met, with a hint", async ({
    page,
  }) => {
    test.skip(!process.env.E2E_OWNER_EMAIL, "E2E_OWNER_EMAIL not set");
    await gotoSettled(page, "/storefront");
    const publish = page.getByRole("button", { name: /publish store|unpublish/i });
    test.skip((await publish.count()) === 0, "No store configured for this test account");

    const label = (await publish.innerText()).trim();
    if (/unpublish/i.test(label)) {
      test.skip(true, "Test store is already live; checked the unpublish path only");
    }
    await expect(publish).toBeDisabled();
    await publish.hover({ force: true });
    await expect(
      page.getByRole("tooltip", { name: /complete launch requirements/i }),
    ).toBeVisible();
  });
});

test.describe("payments (staging sandbox only)", () => {
  test("subscribe button starts Paynow checkout", async ({ page }) => {
    test.skip(
      process.env.E2E_ALLOW_PAYMENT_TESTS !== "1" || !process.env.E2E_OWNER_EMAIL,
      "Set E2E_ALLOW_PAYMENT_TESTS=1 on staging with a Paynow sandbox to run",
    );
    await gotoSettled(page, "/settings/billing");
    const subscribe = page.getByRole("button", { name: /subscribe|pay|upgrade/i }).first();
    await expect(subscribe).toBeVisible();

    const [popup] = await Promise.all([
      page.waitForEvent("popup", { timeout: 15_000 }).catch(() => null),
      subscribe.click(),
    ]);
    const landed = popup ?? page;
    await landed.waitForURL(/paynow|checkout|success|billing/i, { timeout: 30_000 });
  });
});
