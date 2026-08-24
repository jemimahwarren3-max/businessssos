// Single source of truth for what the plan costs — imported by the
// marketing page (display) and the Paynow checkout flow (the actual amount
// charged), so the two can never drift apart.
export const PAID_PLANS = ["pro"] as const;
export type PaidPlan = (typeof PAID_PLANS)[number];

export const PLAN_MONTHLY_USD: Record<PaidPlan, number> = {
  pro: 3,
};

export function planAmountUsd(plan: PaidPlan): number {
  return PLAN_MONTHLY_USD[plan];
}

export function isPaidPlan(plan: string): plan is PaidPlan {
  return (PAID_PLANS as readonly string[]).includes(plan);
}
