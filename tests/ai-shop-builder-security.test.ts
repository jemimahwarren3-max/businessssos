import { describe, expect, it } from "vitest";
import { storefrontLogoStoragePath } from "@/lib/storefront/ai-builder.server";

const businessId = "00000000-0000-0000-0000-000000000001";
const imageId = "89abcdef-0123-4abc-8def-0123456789ab";
const supabaseUrl = "https://project.supabase.co";
const validLogoUrl = `${supabaseUrl}/storage/v1/object/public/product-media/${businessId}/storefront/logo/${imageId}.webp`;

describe("AI shop-builder logo source validation", () => {
  it("allows only a business-owned storefront logo in this Supabase Storage bucket", () => {
    expect(storefrontLogoStoragePath(validLogoUrl, businessId, supabaseUrl)).toBe(
      `${businessId}/storefront/logo/${imageId}.webp`,
    );
  });

  it("rejects external URLs, another business, and non-logo storage paths", () => {
    expect(() =>
      storefrontLogoStoragePath("https://attacker.example/logo.png", businessId, supabaseUrl),
    ).toThrow(/not stored in this business/i);
    expect(() =>
      storefrontLogoStoragePath(
        validLogoUrl.replace(businessId, "00000000-0000-0000-0000-000000000002"),
        businessId,
        supabaseUrl,
      ),
    ).toThrow(/not stored in this business/i);
    expect(() =>
      storefrontLogoStoragePath(
        validLogoUrl.replace("/storefront/logo/", "/storefront/cover/"),
        businessId,
        supabaseUrl,
      ),
    ).toThrow(/not stored in this business/i);
  });
});
