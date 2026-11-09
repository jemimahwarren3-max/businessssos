import { test, expect } from "@playwright/test";

const WIDTHS = [320, 360, 375, 390, 430];
const PUBLIC_ROUTES = ["/", "/auth?mode=signin", "/pricing", "/faq", "/features"];

for (const width of WIDTHS) {
  test.describe(`mobile layout at ${width}px`, () => {
    test.use({ viewport: { width, height: 740 } });

    for (const path of PUBLIC_ROUTES) {
      test(`no horizontal overflow on ${path}`, async ({ page }) => {
        const response = await page.goto(path, { waitUntil: "domcontentloaded" });
        expect(response?.status() ?? 0).toBeLessThan(500);
        await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `page is ${overflow}px wider than the screen`).toBeLessThanOrEqual(0);
      });
    }
  });
}
