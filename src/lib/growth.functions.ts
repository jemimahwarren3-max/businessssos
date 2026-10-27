import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { parseAndSanitize } from "@/lib/security";
import { authedRateLimit } from "@/lib/rate-limit.server";
import type { Db } from "@/lib/business.server";
import {
  getDailyBusinessBriefing,
  generateMarketingDraft,
  getGrowthMetrics,
  listMarketingCampaigns,
  listMarketingProducts,
  saveMarketingCampaign,
} from "./growth.server";
import { marketingDraftInputSchema, saveMarketingCampaignSchema } from "./growth.contract";

const authenticated = [
  authedRateLimit({ keyPrefix: "growth-intelligence", maxRequests: 60, windowSeconds: 60 }),
] as const;
const aiRequests = [
  authedRateLimit({ keyPrefix: "growth-ai", maxRequests: 10, windowSeconds: 60 }),
] as const;

const businessIdSchema = z.object({ businessId: z.string().uuid() });
const growthMetricsInputSchema = businessIdSchema.extend({
  days: z.coerce.number().int().min(1).max(90).default(30),
});

export const getStoreGrowthMetricsFn = createServerFn({ method: "POST" })
  .middleware(authenticated)
  .inputValidator((data: unknown) => parseAndSanitize(growthMetricsInputSchema, data))
  .handler(async ({ data, context }) =>
    getGrowthMetrics(context.supabase as Db, data.businessId, data.days),
  );

export const getMarketingCampaignsFn = createServerFn({ method: "POST" })
  .middleware(authenticated)
  .inputValidator((data: unknown) => parseAndSanitize(businessIdSchema, data))
  .handler(async ({ data, context }) =>
    listMarketingCampaigns(context.supabase as Db, data.businessId),
  );

export const getMarketingProductsFn = createServerFn({ method: "POST" })
  .middleware(authenticated)
  .inputValidator((data: unknown) => parseAndSanitize(businessIdSchema, data))
  .handler(async ({ data, context }) =>
    listMarketingProducts(context.supabase as Db, data.businessId),
  );

export const generateMarketingDraftFn = createServerFn({ method: "POST" })
  .middleware(aiRequests)
  .inputValidator((data: unknown) => parseAndSanitize(marketingDraftInputSchema, data))
  .handler(async ({ data, context }) => generateMarketingDraft(context.supabase as Db, data));

export const saveMarketingCampaignFn = createServerFn({ method: "POST" })
  .middleware(authenticated)
  .inputValidator((data: unknown) => parseAndSanitize(saveMarketingCampaignSchema, data))
  .handler(async ({ data, context }) => saveMarketingCampaign(context.supabase as Db, data));

export const getDailyBusinessBriefingFn = createServerFn({ method: "POST" })
  .middleware(aiRequests)
  .inputValidator((data: unknown) => parseAndSanitize(businessIdSchema, data))
  .handler(async ({ data, context }) =>
    getDailyBusinessBriefing(context.supabase as Db, data.businessId),
  );
