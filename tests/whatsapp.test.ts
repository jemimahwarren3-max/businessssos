import { describe, expect, it } from "vitest";
import {
  buildProductWhatsAppMessage,
  buildSaleReceiptWhatsAppMessage,
  buildWhatsAppLink,
  buildWhatsAppShareUrl,
} from "../src/lib/whatsapp";

describe("buildWhatsAppLink", () => {
  it("rewrites a Zimbabwe local number's leading 0 to the 263 country code", () => {
    const link = buildWhatsAppLink("0771234567", "hello");
    expect(link).toBe("https://wa.me/263771234567?text=hello");
  });

  it("strips formatting characters (spaces, dashes) before rewriting", () => {
    const link = buildWhatsAppLink("077 123 4567", "hi");
    expect(link).toBe("https://wa.me/263771234567?text=hi");
  });

  it("passes through a number that already carries a country code", () => {
    const link = buildWhatsAppLink("+263771234567", "hi");
    expect(link).toBe("https://wa.me/263771234567?text=hi");
  });

  it("URL-encodes the message text", () => {
    const link = buildWhatsAppLink("0771234567", "Total: $10 & tax");
    expect(link).toBe(`https://wa.me/263771234567?text=${encodeURIComponent("Total: $10 & tax")}`);
  });

  it("returns null for a missing phone number", () => {
    expect(buildWhatsAppLink(null, "hi")).toBeNull();
    expect(buildWhatsAppLink(undefined, "hi")).toBeNull();
    expect(buildWhatsAppLink("", "hi")).toBeNull();
  });

  it("returns null when the phone has no digits at all", () => {
    expect(buildWhatsAppLink("n/a", "hi")).toBeNull();
  });
});

describe("WhatsApp share helpers", () => {
  it("opens a chooser when no phone is on file", () => {
    expect(buildWhatsAppShareUrl("hello")).toBe("https://wa.me/?text=hello");
  });

  it("builds a product card with price, availability and link", () => {
    const message = buildProductWhatsAppMessage({
      businessName: "Rudo's Shop",
      productName: "2L cooking oil",
      price: 12,
      currency: "USD",
      availability: "In stock",
      url: "https://rudos.mykwetuu.com/products/oil",
    });
    expect(message).toContain("2L cooking oil from Rudo's Shop");
    expect(message).toContain("Price:");
    expect(message).toContain("Availability: In stock");
    expect(message).toContain("https://rudos.mykwetuu.com/products/oil");
  });

  it("builds a receipt the merchant still has to send", () => {
    const message = buildSaleReceiptWhatsAppMessage({
      businessName: "Rudo's Shop",
      receiptNumber: "S-0004",
      items: [{ name: "Bread", quantity: 2, unitPrice: 1.5 }],
      total: 3,
      currency: "USD",
      paymentMethod: "EcoCash",
    });
    expect(message).toContain("Receipt S-0004");
    expect(message).toContain("Paid: EcoCash");
    expect(message).toContain("2 x Bread");
  });
});
