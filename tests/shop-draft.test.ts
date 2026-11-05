import { describe, expect, it } from "vitest";
import { parseShopDraftResponse, shopDraftInputSchema } from "@/lib/storefront/shop-draft";

const validDraft = {
  storeName: "Green Leaf",
  tagline: "Thoughtful care for everyday skin",
  about: "A small skincare shop.",
  heroTitle: "Care that feels like you daily",
  heroSubtitle: "Explore our skincare collection.",
  seoTitle: "Green Leaf Skincare",
  seoDescription: "Thoughtful skincare for everyday routines and thoughtful gifts.",
  templateId: "beauty-botanical",
  paletteId: "botanical",
  rationale: "The botanical design suits the calm, natural look in your brief.",
};

describe("AI shop draft response validation", () => {
  it("parses valid JSON and fenced JSON drafts", () => {
    expect(parseShopDraftResponse(JSON.stringify(validDraft))).toEqual(validDraft);
    expect(parseShopDraftResponse(`\`\`\`json\n${JSON.stringify(validDraft)}\n\`\`\``)).toEqual(
      validDraft,
    );
  });

  it("rejects unknown template IDs and incomplete responses", () => {
    expect(() =>
      parseShopDraftResponse(JSON.stringify({ ...validDraft, templateId: "invented-template" })),
    ).toThrow();
    expect(() => parseShopDraftResponse('{"storeName":"Only a name"}')).toThrow();
    expect(() =>
      parseShopDraftResponse(
        JSON.stringify({ ...validDraft, heroTitle: "Care that feels like you" }),
      ),
    ).toThrow(/six words/i);
  });

  it("allows an empty optional business brief while bounding provided text", () => {
    expect(
      shopDraftInputSchema.parse({
        businessId: "00000000-0000-0000-0000-000000000001",
      }).brief,
    ).toBe("");
    expect(() =>
      shopDraftInputSchema.parse({
        businessId: "00000000-0000-0000-0000-000000000001",
        brief: "x".repeat(1201),
      }),
    ).toThrow();
  });
});
