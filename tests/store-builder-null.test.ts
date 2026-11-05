import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StoreBuilder } from "@/components/storefront/store-builder";
import { adminStoreSchema } from "@/lib/storefront/contract";

const initialWithoutStore = adminStoreSchema.parse({
  currency: "USD",
  categories: [],
  store: null,
  checklist: {
    name: false,
    template: false,
    products: false,
    payments: false,
    fulfilment: false,
    policies: false,
    previewed: false,
    published: false,
  },
  products: [],
  orders: [],
  metrics: {
    openOrders: 0,
    unpaidOrders: 0,
    outOfStockPublished: 0,
    lowStockPublished: 0,
    publishedProducts: 0,
  },
});

describe("store builder without a store record", () => {
  it("renders a setup prompt and creation action", () => {
    const markup = renderToStaticMarkup(
      createElement(StoreBuilder, {
        businessId: "business-1",
        initial: initialWithoutStore,
        canManage: true,
        creatingStore: false,
        onCreateStore: () => undefined,
      }),
    );

    expect(markup).toContain("Set up your store");
    expect(markup).toContain("Create a store to customize its design and online details.");
    expect(markup).toContain("button");
  });
});
