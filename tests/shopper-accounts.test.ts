import { describe, expect, it } from "vitest";
import { checkoutSchema, shopperAccountSchema } from "@/lib/storefront/contract";

describe("shopper account contract", () => {
  it("allows guest checkout without consent and signed-in consent on the customer object", () => {
    const guest = checkoutSchema.parse({
      slug: "harare-cloth",
      idempotencyKey: "idem-key-12",
      fulfilment: "pickup",
      paymentMethod: "pay_on_pickup",
      customer: { name: "Ada Moyo", phone: "0771234567" },
      items: [{ productId: "11111111-1111-1111-1111-111111111111", quantity: 1 }],
    });
    expect(guest.customer.messagesConsent).toBeUndefined();

    const signedIn = checkoutSchema.parse({
      slug: "harare-cloth",
      idempotencyKey: "idem-key-34",
      fulfilment: "pickup",
      paymentMethod: "pay_on_pickup",
      customer: {
        name: "Ada Moyo",
        phone: "0771234567",
        email: "ada@example.com",
        messagesConsent: true,
      },
      items: [{ productId: "11111111-1111-1111-1111-111111111111", quantity: 1 }],
    });
    expect(signedIn.customer.messagesConsent).toBe(true);
  });

  it("parses an empty shopper history", () => {
    const account = shopperAccountSchema.parse({ messagesConsent: false, orders: [] });
    expect(account.orders).toEqual([]);
  });
});
