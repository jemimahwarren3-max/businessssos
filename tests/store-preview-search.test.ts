import { describe, expect, it } from "vitest";
import { publicStoreSchema } from "@/lib/storefront/contract";
import { isStorePreviewFlag, parseStorePreviewSearch } from "@/lib/storefront/preview-search";
import { isDraftPreview, parsePlatformRoot, publicStoreRedirect } from "@/lib/storefront/host";

const root = parsePlatformRoot("https://mykwetuu.com");

describe("draft preview search", () => {
  it("treats quoted, numeric, and boolean preview flags as draft preview", () => {
    expect(isStorePreviewFlag("1")).toBe(true);
    expect(isStorePreviewFlag('"1"')).toBe(true);
    expect(isStorePreviewFlag(1)).toBe(true);
    expect(isStorePreviewFlag(true)).toBe(true);
    expect(isStorePreviewFlag("true")).toBe(true);
    expect(isStorePreviewFlag("0")).toBe(false);
    expect(isStorePreviewFlag(undefined)).toBe(false);
    expect(parseStorePreviewSearch({ preview: '"1"' })).toEqual({ preview: 1 });
    expect(parseStorePreviewSearch({ preview: "1" })).toEqual({ preview: 1 });
    expect(parseStorePreviewSearch({})).toEqual({});
  });

  it('keeps /store/grande?preview="1" on the platform host instead of redirecting', () => {
    const quoted = new URL("https://mykwetuu.com/store/grande?preview=%221%22");
    expect(isDraftPreview(quoted)).toBe(true);
    expect(publicStoreRedirect(quoted, root)).toBeNull();
    expect(
      publicStoreRedirect(new URL("https://mykwetuu.com/store/grande?preview=1"), root),
    ).toBeNull();
  });
});

describe("publicStoreSchema", () => {
  it("reads a draft shop payload that is missing theme, content, and paynow", () => {
    const parsed = publicStoreSchema.parse({
      slug: "grande",
      status: "draft",
      templateId: "grocery",
      storeName: "Grande",
      tagline: "",
      about: "",
      whatsapp: "",
      email: "",
      phone: "",
      address: "",
      logoUrl: null,
      accentColor: null,
      heroTitle: "",
      heroSubtitle: "",
      policies: "",
      hours: "",
      socials: { instagram: null, facebook: null, website: null, tiktok: null },
      currency: "USD",
      businessType: "grocery",
      delivery: {
        pickupEnabled: true,
        deliveryEnabled: false,
        flatFee: 0,
        freeOver: null,
        minimumOrder: 0,
        areas: "",
        estimate: "",
      },
      payments: {
        payOnPickup: true,
        payOnDelivery: false,
        quotes: false,
      },
      categories: [],
      products: [],
      preview: true,
    });
    expect(parsed.slug).toBe("grande");
    expect(parsed.payments.paynow).toBe(false);
    expect(parsed.theme.background).toMatch(/^#/);
    expect(parsed.content.announcement).toBe("");
  });
});
