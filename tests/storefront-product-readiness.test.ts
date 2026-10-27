import { describe, expect, it } from "vitest";
import { getOnlineProductReadiness } from "@/lib/storefront/product-readiness";

describe("getOnlineProductReadiness", () => {
  it("marks a product ready only when it has a positive price, image, and description", () => {
    expect(
      getOnlineProductReadiness({
        price: 4.5,
        imageUrl: "https://example.test/product.jpg",
        galleryUrls: [],
        details: "Freshly packed.",
      }),
    ).toEqual({ ready: true, missing: [] });
  });

  it("reports all missing selling information", () => {
    expect(
      getOnlineProductReadiness({
        price: 0,
        imageUrl: null,
        galleryUrls: [],
        details: "",
      }),
    ).toEqual({
      ready: false,
      missing: ["Missing selling price", "Missing product image", "Missing description"],
    });
  });

  it("rejects negative and non-finite selling prices", () => {
    for (const price of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        getOnlineProductReadiness({
          price,
          imageUrl: "https://example.test/product.jpg",
          galleryUrls: [],
          details: "Freshly packed.",
        }),
      ).toEqual({ ready: false, missing: ["Missing selling price"] });
    }
  });

  it("accepts a gallery image when the inventory image is absent", () => {
    expect(
      getOnlineProductReadiness({
        price: 4.5,
        imageUrl: null,
        galleryUrls: ["https://example.test/product-gallery.jpg"],
        details: "Freshly packed.",
      }).ready,
    ).toBe(true);
  });
});
