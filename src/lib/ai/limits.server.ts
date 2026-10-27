const DAY_SECONDS = 60 * 60 * 24;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

/** Per-business daily caps (24h). Override via AI_DAILY_LIMIT_* env on Cloud Run. */
export const AI_LIMITS = {
  assistantDaily: parsePositiveInt(process.env["AI_DAILY_LIMIT_ASSISTANT"], 25),
  quickEntryDaily: parsePositiveInt(process.env["AI_DAILY_LIMIT_QUICK_ENTRY"], 25),
  shopBuilderDaily: parsePositiveInt(process.env["AI_DAILY_LIMIT_SHOP_BUILDER"], 5),
  invoiceDraftDaily: parsePositiveInt(process.env["AI_DAILY_LIMIT_INVOICE_DRAFT"], 5),
  campaignDraftDaily: parsePositiveInt(process.env["AI_DAILY_LIMIT_CAMPAIGN_DRAFT"], 5),
  weeklyReportDaily: parsePositiveInt(process.env["AI_DAILY_LIMIT_WEEKLY_REPORT"], 3),
  briefingDaily: parsePositiveInt(process.env["AI_DAILY_LIMIT_BRIEFING"], 3),
  assistantPerMinute: parsePositiveInt(process.env["AI_RATE_LIMIT_ASSISTANT_PER_MIN"], 10),
  quickEntryPerMinute: parsePositiveInt(process.env["AI_RATE_LIMIT_QUICK_ENTRY_PER_MIN"], 10),
  dayWindowSeconds: DAY_SECONDS,
} as const;
