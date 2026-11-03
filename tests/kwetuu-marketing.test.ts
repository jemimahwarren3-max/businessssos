import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BRAND } from "@/lib/brand";
import { PLAN_MONTHLY_USD } from "@/lib/billing-plans";
import { MARKETING_EXISTING_STORE_PROMPT, MARKETING_NAV } from "@/lib/marketing-nav";
import { FEATURED_PUBLISHED_LIMIT, featuredPublishedShops } from "@/lib/storefront/published-shops";
import { EMPTY_MARKETPLACE } from "@/lib/storefront/contract";
import { STORE_TEMPLATES, TEMPLATE_CATEGORIES } from "@/lib/storefront/templates";

describe("Kwetuu public site contract", () => {
  it("keeps the live brand and 60 shop templates", () => {
    expect(BRAND.name).toBe("Kwetuu");
    expect(BRAND.domain).toBe("mykwetuu.com");
    expect(STORE_TEMPLATES).toHaveLength(60);
    expect(PLAN_MONTHLY_USD.pro).toBe(7);
  });

  it("features a slice of real published shops, never a hardcoded demo list", () => {
    expect(FEATURED_PUBLISHED_LIMIT).toBe(6);
    expect(featuredPublishedShops([])).toEqual([]);
    const shops = Array.from({ length: 8 }, (_, i) => ({
      slug: `shop-${i}`,
      storeName: `Shop ${i}`,
      tagline: "",
      businessType: "retail",
      logoUrl: null,
      address: "",
      currency: "USD",
      verified: false,
    }));
    expect(featuredPublishedShops(shops)).toHaveLength(6);
    expect(featuredPublishedShops(shops).map((shop) => shop.slug)).toEqual(
      shops.slice(0, 6).map((shop) => shop.slug),
    );
    expect(EMPTY_MARKETPLACE.shops).toEqual([]);
  });

  it("puts Sign in in the public nav before Start a store", () => {
    expect(MARKETING_NAV.map((item) => item.label)).toEqual([
      "Browse stores",
      "Store designs",
      "Pricing",
      "FAQ",
    ]);
    expect(MARKETING_EXISTING_STORE_PROMPT).toBe(
      "Already have a Kwetuu store? Sign in to manage your business.",
    );
    const shell = readFileSync("src/components/marketing-shell.tsx", "utf8");
    const hero = readFileSync("src/routes/index.tsx", "utf8");
    expect(shell).toContain('search={{ mode: "signin" }}');
    expect(shell.indexOf("Sign in")).toBeLessThan(shell.indexOf("Start a store"));
    expect(hero).toContain("Already have a Kwetuu store?");
    expect(hero).toContain('search={{ mode: "signin" }}');
  });

  it("provides six unique visual compositions in each storefront category", () => {
    expect(TEMPLATE_CATEGORIES).toHaveLength(10);
    expect(
      TEMPLATE_CATEGORIES.every(
        (category) =>
          STORE_TEMPLATES.filter((template) => template.category === category.id).length === 6,
      ),
    ).toBe(true);
    expect(
      STORE_TEMPLATES.every((template) =>
        template.sampleLabel.toLowerCase().includes("sample catalogue"),
      ),
    ).toBe(true);
  });
});
