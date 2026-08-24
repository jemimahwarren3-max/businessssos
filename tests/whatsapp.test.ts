import { describe, expect, it } from "vitest";
import { buildWhatsAppLink } from "../src/lib/whatsapp";

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
