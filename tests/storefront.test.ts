import { describe, expect, it } from "vitest";
import { marketplaceSchema } from "@/lib/storefront/contract";
import {
  parsePlatformRoot,
  publicStoreRedirect,
  rewriteStoreInputUrl,
  rewriteStoreOutputUrl,
  storePublicUrlOn,
  storeSlugFromHostname,
} from "@/lib/storefront/host";
import { deliveryFee, orderTotal, roundMoney } from "@/lib/storefront/pricing";
import { STORE_TEMPLATES, TEMPLATE_IDS, isTemplateId } from "@/lib/storefront/templates";
import { allowedFulfilments, allowedPayments, cashPolicyLines } from "@/lib/storefront/order-rules";
import { fulfilmentActions } from "@/lib/storefront/transitions";
import type { PublicStore } from "@/lib/storefront/contract";

const root = parsePlatformRoot("http://localhost:8080");

describe("store subdomains", () => {
  it("reads a shop label from the host and ignores the platform host", () => {
    expect(storeSlugFromHostname("harare-cloth.localhost", "localhost")).toBe("harare-cloth");
    expect(storeSlugFromHostname("localhost", "localhost")).toBeNull();
    expect(storeSlugFromHostname("www.localhost", "localhost")).toBeNull();
    expect(storeSlugFromHostname("market.localhost", "localhost")).toBeNull();
    expect(storeSlugFromHostname("privacy.localhost", "localhost")).toBeNull();
    expect(storeSlugFromHostname("terms.localhost", "localhost")).toBeNull();
    expect(storeSlugFromHostname("shop.example.com", "localhost")).toBeNull();
  });

  it("maps a shop host onto the internal store routes", () => {
    const cart = rewriteStoreInputUrl(
      new URL("http://harare-cloth.localhost:8080/cart"),
      "localhost",
    );
    expect(cart?.pathname).toBe("/store/harare-cloth/cart");
    const home = rewriteStoreInputUrl(new URL("http://harare-cloth.localhost:8080/"), "localhost");
    expect(home?.pathname).toBe("/store/harare-cloth");
    const asset = rewriteStoreInputUrl(
      new URL("http://harare-cloth.localhost:8080/assets/app.js"),
      "localhost",
    );
    expect(asset).toBeUndefined();
  });

  it("publishes shop links on the shop host and leaves draft preview on the platform host", () => {
    const product = rewriteStoreOutputUrl(
      new URL("http://localhost:8080/store/harare-cloth/products/dress"),
      "localhost",
    );
    expect(product?.href).toBe("http://harare-cloth.localhost:8080/products/dress");
    const preview = rewriteStoreOutputUrl(
      new URL("http://localhost:8080/store/harare-cloth?preview=1"),
      "localhost",
    );
    expect(preview).toBeUndefined();
    const encodedPreview = rewriteStoreOutputUrl(
      new URL("http://localhost:8080/store/harare-cloth?preview=%221%22"),
      "localhost",
    );
    expect(encodedPreview).toBeUndefined();
    expect(storePublicUrlOn(root, "harare-cloth", "/products/dress")).toBe(
      "http://harare-cloth.localhost:8080/products/dress",
    );
  });

  it("redirects the old shop path and keeps the merchant app on the platform host", () => {
    expect(
      publicStoreRedirect(new URL("http://localhost:8080/store/harare-cloth/cart?x=1"), root),
    ).toBe("http://harare-cloth.localhost:8080/cart?x=1");
    expect(
      publicStoreRedirect(new URL("http://localhost:8080/store/harare-cloth?preview=1"), root),
    ).toBeNull();
    expect(publicStoreRedirect(new URL("http://127.0.0.1:8080/store/harare-cloth"), root)).toBe(
      "http://harare-cloth.localhost:8080/",
    );
    expect(publicStoreRedirect(new URL("http://harare-cloth.localhost:8080/market"), root)).toBe(
      "http://localhost:8080/market",
    );
    expect(
      publicStoreRedirect(new URL("http://harare-cloth.localhost:8080/cart"), root),
    ).toBeNull();
    expect(
      publicStoreRedirect(new URL("http://harare-cloth.localhost:8080/@vite/client"), root),
    ).toBeNull();
  });
});

describe("marketplace directory", () => {
  it("requires the selling shop on every product and ignores fields that are not public", () => {
    const parsed = marketplaceSchema.parse({
      query: "",
      category: "",
      shops: [],
      categories: [],
      featured: [],
      recent: [],
      products: [
        {
          id: "p1",
          slug: "dress",
          name: "Black dress",
          price: "12.5",
          currency: "USD",
          imageUrl: null,
          categoryName: "Clothing",
          stockLabel: "Only 4 left",
          available: true,
          featured: false,
          storeSlug: "harare-cloth",
          storeName: "Harare Cloth",
          costPrice: 4,
        },
      ],
    });
    expect(parsed.products[0]?.storeName).toBe("Harare Cloth");
    expect(parsed.products[0]?.price).toBe(12.5);
    expect(parsed.products[0]).not.toHaveProperty("costPrice");
  });
});

describe("storefront pricing", () => {
  it("charges a flat delivery fee and waives it over the threshold", () => {
    expect(deliveryFee({ fulfilment: "delivery", subtotal: 10, flatFee: 3, freeOver: 20 })).toBe(3);
    expect(deliveryFee({ fulfilment: "delivery", subtotal: 20, flatFee: 3, freeOver: 20 })).toBe(0);
    expect(deliveryFee({ fulfilment: "pickup", subtotal: 10, flatFee: 3, freeOver: null })).toBe(0);
  });

  it("adds tax and delivery once", () => {
    expect(orderTotal({ subtotal: 10, tax: 1.5, deliveryFee: 2 })).toBe(13.5);
    expect(roundMoney(1.005)).toBe(1.01);
  });
});

describe("storefront templates", () => {
  it("defines ten distinct layouts", () => {
    expect(STORE_TEMPLATES).toHaveLength(10);
    expect(new Set(STORE_TEMPLATES.map((template) => template.layout)).size).toBe(10);
    expect(new Set(TEMPLATE_IDS).size).toBe(10);
    for (const template of STORE_TEMPLATES) {
      expect(template.sampleLabel.toLowerCase()).toContain("sample");
      expect(isTemplateId(template.id)).toBe(true);
    }
  });
});

describe("online order transitions", () => {
  it("does not treat an unpaid pickup order as paid", () => {
    const actions = fulfilmentActions({
      fulfilmentStatus: "awaiting_confirmation",
      fulfilmentMethod: "pickup",
      paymentMethod: "pay_on_pickup",
      paymentStatus: "unpaid",
      saleId: null,
    });
    expect(actions).toContain("confirm");
    expect(actions).toContain("mark_paid");
    expect(actions).toContain("cancel");
    expect(actions).not.toContain("complete");
  });

  it("requires a quote to be accepted before payment", () => {
    const actions = fulfilmentActions({
      fulfilmentStatus: "awaiting_confirmation",
      fulfilmentMethod: "quote",
      paymentMethod: "quote",
      paymentStatus: "unpaid",
      saleId: null,
    });
    expect(actions).toContain("accept");
    expect(actions).not.toContain("mark_paid");
  });

  it("stops cancellation after a sale exists", () => {
    const actions = fulfilmentActions({
      fulfilmentStatus: "confirmed",
      fulfilmentMethod: "pickup",
      paymentMethod: "pay_on_pickup",
      paymentStatus: "paid",
      saleId: "sale-1",
    });
    expect(actions).not.toContain("cancel");
    expect(actions).not.toContain("mark_paid");
    expect(actions).toContain("preparing");
  });
});

function sampleStore(
  delivery: Partial<PublicStore["delivery"]>,
  payments: Partial<PublicStore["payments"]>,
): Pick<PublicStore, "delivery" | "payments" | "currency"> {
  return {
    currency: "USD",
    delivery: {
      pickupEnabled: true,
      deliveryEnabled: false,
      flatFee: 0,
      freeOver: null,
      minimumOrder: 0,
      areas: "",
      estimate: "",
      quoteRequired: false,
      autoAccept: false,
      prepMinutes: 0,
      cutoff: "",
      cutoffTime: null,
      collectionWindows: "",
      timezone: "Africa/Harare",
      weeklyHours: [],
      windows: [],
      ...delivery,
    },
    payments: {
      payOnPickup: true,
      payOnDelivery: false,
      quotes: false,
      paynow: false,
      cashCurrencies: "",
      exactCash: false,
      changeProvided: false,
      ...payments,
    },
  };
}

describe("order rules", () => {
  it("hides priced delivery when the shop requires a quote", () => {
    const store = sampleStore(
      { pickupEnabled: false, deliveryEnabled: true, quoteRequired: true },
      { payOnPickup: false, payOnDelivery: true, quotes: true },
    );
    expect(allowedFulfilments(store)).toEqual(["quote"]);
    expect(allowedPayments(store, "delivery")).toEqual(["quote"]);
    expect(allowedPayments(store, "quote")).toEqual(["quote"]);
  });

  it("does not offer cash on delivery for pickup, or Paynow", () => {
    const store = sampleStore(
      { pickupEnabled: true, deliveryEnabled: true },
      { payOnPickup: true, payOnDelivery: true, quotes: true, paynow: true },
    );
    expect(allowedFulfilments(store)).toEqual(["pickup", "delivery", "quote"]);
    expect(allowedPayments(store, "pickup")).toEqual(["pay_on_pickup", "quote"]);
    expect(allowedPayments(store, "delivery")).toEqual(["pay_on_delivery", "quote"]);
  });

  it("states exact cash before the customer commits", () => {
    const store = sampleStore({}, { cashCurrencies: "USD", exactCash: true, changeProvided: true });
    expect(cashPolicyLines(store)).toEqual([
      "Cash accepted in USD.",
      "Bring the exact amount. This shop has not agreed to give change.",
    ]);
  });
});
