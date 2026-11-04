import { describe, expect, it } from "vitest";
import { saleItemSchema } from "@/lib/business.schemas";
import {
  deriveCommerceModel,
  navShowsInventoryFirst,
  navShowsServicesFirst,
} from "@/lib/commerce-model";
import { bookingSchema, publicBookingSchema, serviceSchema } from "@/lib/services.schemas";

describe("commerce model", () => {
  it("derives hybrid when a shop sells both", () => {
    expect(deriveCommerceModel(true, true)).toBe("hybrid");
    expect(deriveCommerceModel(false, true)).toBe("services");
    expect(deriveCommerceModel(true, false)).toBe("products");
  });

  it("emphasises nav without hiding the other offering", () => {
    expect(navShowsServicesFirst("services")).toBe(true);
    expect(navShowsServicesFirst("hybrid")).toBe(true);
    expect(navShowsServicesFirst("products")).toBe(false);
    expect(navShowsInventoryFirst("products")).toBe(true);
    expect(navShowsInventoryFirst("hybrid")).toBe(true);
    expect(navShowsInventoryFirst("services")).toBe(false);
  });
});

describe("saleItemSchema", () => {
  it("accepts a product line or a service line, not both", () => {
    expect(
      saleItemSchema.parse({
        productId: "11111111-1111-4111-8111-111111111111",
        quantity: 1,
        unitPrice: 10,
      }).productId,
    ).toBe("11111111-1111-4111-8111-111111111111");
    expect(
      saleItemSchema.parse({
        serviceId: "22222222-2222-4222-8222-222222222222",
        quantity: 1,
        unitPrice: 25,
      }).serviceId,
    ).toBe("22222222-2222-4222-8222-222222222222");
    expect(() =>
      saleItemSchema.parse({
        productId: "11111111-1111-4111-8111-111111111111",
        serviceId: "22222222-2222-4222-8222-222222222222",
        quantity: 1,
        unitPrice: 10,
      }),
    ).toThrow();
    expect(() => saleItemSchema.parse({ quantity: 1, unitPrice: 10 })).toThrow();
  });
});

describe("service schemas", () => {
  it("requires a service name and duration", () => {
    const parsed = serviceSchema.parse({
      businessId: "11111111-1111-4111-8111-111111111111",
      name: "Braids",
    });
    expect(parsed.durationMinutes).toBe(60);
    expect(parsed.pricingType).toBe("fixed");
    expect(() =>
      serviceSchema.parse({ businessId: "11111111-1111-4111-8111-111111111111", name: "" }),
    ).toThrow();
  });

  it("requires a customer name for bookings", () => {
    expect(() =>
      bookingSchema.parse({
        businessId: "11111111-1111-4111-8111-111111111111",
        serviceId: "22222222-2222-4222-8222-222222222222",
        customerName: "",
        startsAt: "2026-11-04T08:00:00.000Z",
      }),
    ).toThrow();
    expect(
      publicBookingSchema.parse({
        slug: "harare-salon",
        serviceId: "22222222-2222-4222-8222-222222222222",
        startsAt: "2026-11-04T08:00:00.000Z",
        customerName: "Chipo",
        customerPhone: "0772000000",
      }).slug,
    ).toBe("harare-salon");
  });
});
