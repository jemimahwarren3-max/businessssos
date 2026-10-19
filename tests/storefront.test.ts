import { describe, expect, it } from "vitest";
import { marketplaceSchema } from "@/lib/storefront/contract";
import { deliveryFee, orderTotal, roundMoney } from "@/lib/storefront/pricing";
import { STORE_TEMPLATES, TEMPLATE_IDS, isTemplateId } from "@/lib/storefront/templates";
import { fulfilmentActions } from "@/lib/storefront/transitions";

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
