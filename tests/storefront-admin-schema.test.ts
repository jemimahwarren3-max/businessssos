import { describe, expect, it } from "vitest";
import { adminStoreSchema } from "@/lib/storefront/contract";

const emptyChecklist = {
  name: false,
  template: false,
  products: false,
  payments: false,
  fulfilment: false,
  policies: false,
  previewed: false,
  published: false,
};

describe("adminStoreSchema", () => {
  it("accepts catalogue products with null details and galleryUrls", () => {
    const parsed = adminStoreSchema.parse({
      currency: "USD",
      categories: [],
      store: null,
      checklist: emptyChecklist,
      products: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          name: "White sugar",
          publicName: null,
          categoryId: null,
          sku: null,
          price: 2.5,
          stock: 10,
          unit: "kg",
          imageUrl: null,
          galleryUrls: null,
          categoryName: null,
          published: false,
          slug: null,
          featured: false,
          minQty: 1,
          maxQty: null,
          details: null,
          sizeGuide: null,
        },
      ],
      orders: [],
      metrics: {
        openOrders: 0,
        unpaidOrders: 0,
        outOfStockPublished: 0,
        lowStockPublished: 0,
        publishedProducts: 0,
      },
    });
    expect(parsed.products[0]?.details).toBe("");
    expect(parsed.products[0]?.galleryUrls).toEqual([]);
    expect(parsed.products[0]?.sizeGuide).toBe("");
  });
});
