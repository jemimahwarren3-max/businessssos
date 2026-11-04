import { describe, expect, it } from "vitest";
import { getOnlineProductReadiness } from "@/lib/storefront/product-readiness";

describe("getOnlineProductReadiness", () => {
  it("handles missing store details and gallery values without throwing", () => {
    const result = getOnlineProductReadiness({
      price: 25,
      imageUrl: null,
      galleryUrls: null,
      details: null,
    });

    expect(result.ready).toBe(false);
    expect(result.missing).toContain("Missing product image");
    expect(result.missing).toContain("Missing description");
  });

  it("marks a product ready when the required fields are present", () => {
    const result = getOnlineProductReadiness({
      price: 25,
      imageUrl: "https://example.com/image.jpg",
      galleryUrls: [],
      details: "A complete description",
    });

    expect(result.ready).toBe(true);
    expect(result.missing).toEqual([]);
  });
});
