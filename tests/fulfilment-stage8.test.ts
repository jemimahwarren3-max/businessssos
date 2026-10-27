import { describe, expect, it } from "vitest";
import {
  deliveryPricingMethod,
  enabledDeliveryZones,
  findDeliveryZone,
} from "@/lib/storefront/delivery-zones";
import { deliveryFee, deliveryFeeForStore } from "@/lib/storefront/pricing";
import { fulfilmentActions } from "@/lib/storefront/transitions";

describe("delivery zones and fees", () => {
  const zones = [
    {
      id: "cbd",
      name: "Harare CBD",
      enabled: true,
      fee: 3,
      freeOver: 50,
      minOrder: 10,
      estimate: "Same day",
    },
    {
      id: "west",
      name: "Westgate area",
      enabled: false,
      fee: 5,
      freeOver: null,
      minOrder: 0,
      estimate: "",
    },
  ];

  it("offers only enabled zones to customers", () => {
    expect(enabledDeliveryZones(zones).map((z) => z.id)).toEqual(["cbd"]);
  });

  it("calculates zone fees and free-over in USD", () => {
    expect(
      deliveryFeeForStore({
        fulfilment: "delivery",
        subtotal: 20,
        delivery: { flatFee: 99, freeOver: null, pricingMethod: "zone", zones },
        zoneId: "cbd",
      }),
    ).toBe(3);
    expect(
      deliveryFeeForStore({
        fulfilment: "delivery",
        subtotal: 60,
        delivery: { flatFee: 99, freeOver: null, pricingMethod: "zone", zones },
        zoneId: "cbd",
      }),
    ).toBe(0);
  });

  it("uses flat pricing when method is flat", () => {
    expect(
      deliveryFee({
        fulfilment: "delivery",
        subtotal: 20,
        flatFee: 4,
        freeOver: null,
        pricingMethod: "flat",
      }),
    ).toBe(4);
  });

  it("charges no delivery fee for collection", () => {
    expect(
      deliveryFeeForStore({
        fulfilment: "pickup",
        subtotal: 100,
        delivery: { flatFee: 4, freeOver: null, pricingMethod: "flat", zones },
        zoneId: "cbd",
      }),
    ).toBe(0);
  });

  it("formats ZiG totals via zone fee helper without conversion", () => {
    const zone = findDeliveryZone(zones, "cbd");
    expect(zone?.name).toBe("Harare CBD");
    expect(
      deliveryFee({
        fulfilment: "delivery",
        subtotal: 15,
        flatFee: 0,
        freeOver: null,
        pricingMethod: "zone",
        zone,
      }),
    ).toBe(3);
  });

  it("treats quote-required shops as quote pricing method", () => {
    expect(deliveryPricingMethod({ quoteRequired: true, pricingMethod: "flat" })).toBe("quote");
  });
});

describe("fulfilment transitions", () => {
  it("does not offer dispatch for pickup orders", () => {
    const actions = fulfilmentActions({
      fulfilmentStatus: "ready",
      fulfilmentMethod: "pickup",
      paymentMethod: "pay_on_pickup",
      paymentStatus: "paid",
      saleId: "sale-1",
    });
    expect(actions).toContain("complete");
    expect(actions).not.toContain("dispatch");
  });

  it("offers dispatch only for delivery at ready", () => {
    const actions = fulfilmentActions({
      fulfilmentStatus: "ready",
      fulfilmentMethod: "delivery",
      paymentMethod: "pay_on_delivery",
      paymentStatus: "unpaid",
      saleId: null,
    });
    expect(actions).toContain("dispatch");
    expect(actions).not.toContain("complete");
  });
});
