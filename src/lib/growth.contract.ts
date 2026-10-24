import { z } from "zod";

export const marketingChannelSchema = z.enum([
  "whatsapp",
  "instagram",
  "facebook",
  "tiktok",
  "google",
  "email",
  "other",
]);

export const growthMetricsSchema = z.object({
  periodDays: z.coerce.number().int().min(1).max(90),
  uniqueVisitors: z.coerce.number().int().nonnegative(),
  productViews: z.coerce.number().int().nonnegative(),
  addToCartVisitors: z.coerce.number().int().nonnegative(),
  checkoutVisitors: z.coerce.number().int().nonnegative(),
  orders: z.coerce.number().int().nonnegative(),
  paidOrders: z.coerce.number().int().nonnegative(),
  trackedPaidOrders: z.coerce.number().int().nonnegative(),
  trackedPaidVisitors: z.coerce.number().int().nonnegative(),
  conversionRate: z.coerce.number().min(0).max(100),
  paidRevenueByCurrency: z.array(
    z.object({
      currency: z.string().min(1).max(8),
      amount: z.coerce.number().nonnegative(),
    }),
  ),
  sources: z.array(
    z.object({
      source: z.string().min(1).max(30),
      visitors: z.coerce.number().int().nonnegative(),
    }),
  ),
  products: z.array(
    z.object({
      productId: z.string().uuid(),
      name: z.string(),
      views: z.coerce.number().int().nonnegative(),
    }),
  ),
  campaigns: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      channel: marketingChannelSchema,
      visitors: z.coerce.number().int().nonnegative(),
      orders: z.coerce.number().int().nonnegative(),
      paidOrders: z.coerce.number().int().nonnegative(),
      paidRevenueByCurrency: z.array(
        z.object({
          currency: z.string().min(1).max(8),
          amount: z.coerce.number().nonnegative(),
        }),
      ),
    }),
  ),
});

export const marketingDraftSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    headline: z.string().trim().max(160),
    copy: z.string().trim().max(1200),
    callToAction: z.string().trim().max(120),
  })
  .strict();

export const marketingDraftInputSchema = z.object({
  businessId: z.string().uuid(),
  channel: marketingChannelSchema,
  objective: z.string().trim().min(5).max(240),
  productId: z.string().uuid().nullable().optional(),
});

export const saveMarketingCampaignSchema = marketingDraftInputSchema.extend({
  name: z.string().trim().min(1).max(100),
  headline: z.string().trim().max(160),
  copy: z.string().trim().max(1200),
  callToAction: z.string().trim().max(120),
});

export const storefrontEventSchema = z.object({
  slug: z.string().trim().min(3).max(40),
  eventKey: z.string().uuid(),
  visitorId: z.string().uuid(),
  eventType: z.enum(["page_view", "product_view", "add_to_cart", "checkout_start", "order_placed"]),
  productSlug: z.string().trim().max(80).optional(),
  campaignId: z.string().uuid().optional(),
  source: z.enum([
    "direct",
    "whatsapp",
    "instagram",
    "facebook",
    "tiktok",
    "google",
    "email",
    "referral",
    "other",
  ]),
});

export type GrowthMetrics = z.infer<typeof growthMetricsSchema>;
export type MarketingChannel = z.infer<typeof marketingChannelSchema>;
export type MarketingDraft = z.infer<typeof marketingDraftSchema>;
export type MarketingDraftInput = z.infer<typeof marketingDraftInputSchema>;
export type SaveMarketingCampaignInput = z.infer<typeof saveMarketingCampaignSchema>;
export type StorefrontEventInput = z.infer<typeof storefrontEventSchema>;

export function parseMarketingDraftResponse(response: string): MarketingDraft {
  const json = response
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return marketingDraftSchema.parse(JSON.parse(json));
}
