// Single source of truth for what the plan costs — imported by the
// marketing page (display) and the Paynow checkout flow (the actual amount
// charged), so the two can never drift apart.
export const PAID_PLANS = ["pro"] as const;
export type PaidPlan = (typeof PAID_PLANS)[number];

export const PLAN_MONTHLY_USD: Record<PaidPlan, number> = {
  pro: 7,
};

/** Free Pro trial length shown in the product. SQL uses `interval '1 month'`. */
export const TRIAL_LENGTH_LABEL = "1-month";

export type BillingChargeCurrency = "USD" | "ZWG";

/** USD and ZiG are both offered; ZiG needs a stored platform rate to charge. */
export function billingChargeChoices(input: {
  usd: number;
  zig: number | null;
}): { currency: BillingChargeCurrency; amount: number | null; canCharge: boolean }[] {
  return [
    { currency: "USD", amount: input.usd, canCharge: input.usd > 0 },
    { currency: "ZWG", amount: input.zig, canCharge: input.zig != null && input.zig > 0 },
  ];
}

export function planAmountUsd(plan: PaidPlan): number {
  return PLAN_MONTHLY_USD[plan];
}

export function isPaidPlan(plan: string): plan is PaidPlan {
  return (PAID_PLANS as readonly string[]).includes(plan);
}

export type PlatformFx = {
  usdToZwg: number;
  source: string;
  effectiveOn: string;
  notice: string;
};

export function planAmountZig(usd: number, fx: PlatformFx | null): number | null {
  if (!fx || !(fx.usdToZwg > 0)) return null;
  return Math.round(usd * fx.usdToZwg * 100) / 100;
}
