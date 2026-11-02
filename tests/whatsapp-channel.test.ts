import { describe, expect, it } from "vitest";
import {
  buildWhatsAppTemplatePayload,
  graphWhatsAppMessagesUrl,
  readWhatsAppCloudConfig,
  WHATSAPP_TEMPLATE_NAMES,
} from "@/lib/notifications/whatsapp-cloud";
import { toWhatsAppAddress } from "@/lib/whatsapp";
import { checkoutSchema, shopperAccountSchema } from "@/lib/storefront/contract";

describe("WhatsApp Cloud config", () => {
  it("stays off when credentials are missing and does not imply a send", () => {
    const config = readWhatsAppCloudConfig({});
    expect(config.configured).toBe(false);
    if (!config.configured) {
      expect(config.reason).toMatch(/not discarded|queued/i);
      expect(config.reason).toMatch(/not marked sent/i);
    }
  });

  it("stays off when only one of the two settings is present", () => {
    expect(readWhatsAppCloudConfig({ WHATSAPP_CLOUD_TOKEN: "token" }).configured).toBe(false);
    expect(readWhatsAppCloudConfig({ WHATSAPP_CLOUD_PHONE_NUMBER_ID: "123" }).configured).toBe(
      false,
    );
  });

  it("turns on only with a token and phone-number id", () => {
    expect(
      readWhatsAppCloudConfig({
        WHATSAPP_CLOUD_TOKEN: "token",
        WHATSAPP_CLOUD_PHONE_NUMBER_ID: "123456",
      }),
    ).toEqual({ configured: true, token: "token", phoneNumberId: "123456" });
  });

  it("maps order templates to documented Meta names without sending", () => {
    const payload = buildWhatsAppTemplatePayload({
      to: "263771234567",
      templateKey: "customer.order.placed",
      body: "Order ON-0001 received.",
    });
    expect(payload.to).toBe("263771234567");
    expect(payload.template.name).toBe(WHATSAPP_TEMPLATE_NAMES["customer.order.placed"]);
    expect(graphWhatsAppMessagesUrl("123456")).toContain("123456/messages");
  });

  it("maps marketing copy to the documented template name", () => {
    const payload = buildWhatsAppTemplatePayload({
      to: "263771234567",
      templateKey: "marketing.broadcast",
      body: "This week's honey is in.",
    });
    expect(payload.template.name).toBe("kwetuu_marketing");
  });
});

describe("checkout WhatsApp opt-in", () => {
  it("accepts transactional and marketing flags without requiring them", () => {
    const guest = checkoutSchema.parse({
      slug: "harare-cloth",
      idempotencyKey: "idem-key-12",
      fulfilment: "pickup",
      paymentMethod: "pay_on_pickup",
      customer: { name: "Ada Moyo", phone: "0771234567", whatsappUpdates: true },
      items: [{ productId: "11111111-1111-1111-1111-111111111111", quantity: 1 }],
    });
    expect(guest.customer.whatsappUpdates).toBe(true);
    expect(guest.customer.marketingConsent).toBeUndefined();
  });

  it("parses a shopper account with a marketing list flag", () => {
    const account = shopperAccountSchema.parse({
      messagesConsent: false,
      marketingConsent: true,
      orders: [],
    });
    expect(account.marketingConsent).toBe(true);
  });
});

describe("Zimbabwe WhatsApp address", () => {
  it("rewrites a local 0 prefix to 263", () => {
    expect(toWhatsAppAddress("0771234567")).toBe("263771234567");
  });

  it("refuses a number too short to dial", () => {
    expect(toWhatsAppAddress("123")).toBeNull();
  });
});
