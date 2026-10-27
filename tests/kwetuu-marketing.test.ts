import { describe, expect, it } from "vitest";
import { BRAND } from "@/lib/brand";
import { PLAN_MONTHLY_USD } from "@/lib/billing-plans";
import { FEATURED_PUBLISHED_LIMIT, featuredPublishedShops } from "@/lib/storefront/published-shops";
import { EMPTY_MARKETPLACE } from "@/lib/storefront/contract";
import { STORE_TEMPLATES } from "@/lib/storefront/templates";

describe("Kwetuu public site contract", () => {
  it("keeps the live brand and ten shop templates", () => {
    expect(BRAND.name).toBe("Kwetuu");
    expect(BRAND.domain).toBe("mykwetuu.com");
    expect(STORE_TEMPLATES).toHaveLength(10);
    expect(PLAN_MONTHLY_USD.pro).toBe(3);
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
    }));
    expect(featuredPublishedShops(shops)).toHaveLength(6);
    expect(featuredPublishedShops(shops).map((shop) => shop.slug)).toEqual(
      shops.slice(0, 6).map((shop) => shop.slug),
    );
    expect(EMPTY_MARKETPLACE.shops).toEqual([]);
  });

  it("gives each template a distinct layout sketch", () => {
    const layouts = new Set(STORE_TEMPLATES.map((template) => template.layout));
    expect(layouts.size).toBe(STORE_TEMPLATES.length);
    expect(
      STORE_TEMPLATES.every((template) => template.sampleLabel.includes("not your products")),
    ).toBe(true);
  });
});
