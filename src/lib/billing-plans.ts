// Single source of truth for what the plan costs — imported by the
// marketing page (display) and the Paynow checkout flow (the actual amount
// charged), so the two can never drift apart.
export const PAID_PLANS = ["pro"] as const;
export type PaidPlan = (typeof PAID_PLANS)[number];

export const PLAN_MONTHLY_USD: Record<PaidPlan, number> = {
  pro: 7,
};

export const PLAN_MONTHLY_ZWG: Record<PaidPlan, number> = {
  pro: 210,
};

export const SUBSCRIPTION_CURRENCIES = ["USD", "ZWG"] as const;
export type SubscriptionCurrency = (typeof SUBSCRIPTION_CURRENCIES)[number];

export function planAmountUsd(plan: PaidPlan): number {
  return PLAN_MONTHLY_USD[plan];
}

export function planAmountForCurrency(plan: PaidPlan, currency: SubscriptionCurrency): number {
  return currency === "USD" ? PLAN_MONTHLY_USD[plan] : PLAN_MONTHLY_ZWG[plan];
}

export function isSubscriptionCurrency(value: string): value is SubscriptionCurrency {
  return (SUBSCRIPTION_CURRENCIES as readonly string[]).includes(value);
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
