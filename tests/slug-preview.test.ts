import { describe, expect, it } from "vitest";
import { previewShopSlug } from "@/lib/storefront/slug-preview";

describe("previewShopSlug", () => {
  it("slugifies shop names for display", () => {
    expect(previewShopSlug("Rudo's Beauty Corner")).toBe("rudosbeautycorner");
    expect(previewShopSlug("  Mbare Fresh  ")).toBe("mbarefresh");
  });

  it("falls back when the name has no usable characters", () => {
    expect(previewShopSlug("!!!")).toBe("yourshop");
    expect(previewShopSlug("")).toBe("yourshop");
  });
});
