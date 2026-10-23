import { z } from "zod";
import { TEMPLATE_IDS } from "./templates";

export const SHOP_DRAFT_PALETTE_IDS = [
  "linen",
  "botanical",
  "rose",
  "cobalt",
  "market",
  "midnight",
  "plum",
  "mono",
] as const;

export const shopDraftSchema = z.object({
  storeName: z.string().trim().min(1).max(80),
  tagline: z.string().trim().max(160),
  about: z.string().trim().max(600),
  heroTitle: z.string().trim().min(1).max(100),
  heroSubtitle: z.string().trim().max(180),
  templateId: z.enum(TEMPLATE_IDS),
  paletteId: z.enum(SHOP_DRAFT_PALETTE_IDS),
  rationale: z.string().trim().min(1).max(240),
});

export type ShopDraft = z.infer<typeof shopDraftSchema>;

export function parseShopDraftResponse(response: string): ShopDraft {
  const json = response
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return shopDraftSchema.parse(JSON.parse(json));
}
