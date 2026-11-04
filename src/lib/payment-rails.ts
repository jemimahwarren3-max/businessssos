import { paymentMethodSchema } from "./business.schemas";

/** Zimbabwe-launch POS rails mapped onto the existing payment_method enum.
 * Labels are not provider confirmation — EcoCash here means "recorded as EcoCash". */
export const POS_PAYMENT_RAILS = [
  { value: "cash", label: "Cash", method: "cash" as const },
  { value: "ecocash", label: "EcoCash", method: "mobile_money" as const },
  { value: "innbucks", label: "InnBucks", method: "mobile_money" as const },
  { value: "zipit", label: "ZIPIT", method: "bank_transfer" as const },
  { value: "bank", label: "Bank transfer", method: "bank_transfer" as const },
  { value: "card", label: "Card", method: "card" as const },
  { value: "credit", label: "Credit (on account)", method: "credit" as const },
] as const;

export type PosPaymentRail = (typeof POS_PAYMENT_RAILS)[number]["value"];
export type PaymentMethodValue = "cash" | "card" | "mobile_money" | "bank_transfer" | "credit";

const RAIL_BY_VALUE = new Map(POS_PAYMENT_RAILS.map((rail) => [rail.value, rail]));

const METHOD_LABEL: Record<PaymentMethodValue, string> = {
  cash: "Cash",
  card: "Card",
  mobile_money: "Mobile money",
  bank_transfer: "Bank transfer",
  credit: "Credit",
};

export const POS_RAIL_VALUES = POS_PAYMENT_RAILS.map((rail) => rail.value);

export function isPosPaymentRail(value: string): value is PosPaymentRail {
  return RAIL_BY_VALUE.has(value as PosPaymentRail);
}

export function railToPaymentMethod(rail: string): PaymentMethodValue {
  const match = RAIL_BY_VALUE.get(rail as PosPaymentRail);
  if (match) return match.method;
  const parsed = paymentMethodSchema.safeParse(rail);
  return parsed.success ? parsed.data : "cash";
}

export function defaultRailForMethod(method: string): PosPaymentRail | string {
  if (method === "mobile_money") return "mobile_money";
  if (method === "bank_transfer") return "bank";
  if (isPosPaymentRail(method)) return method;
  return method;
}

export function paymentRailLabel(rail: string | null | undefined, method?: string | null): string {
  if (rail && RAIL_BY_VALUE.has(rail as PosPaymentRail)) {
    return RAIL_BY_VALUE.get(rail as PosPaymentRail)!.label;
  }
  if (rail === "mobile_money" || method === "mobile_money") return "Mobile money";
  if (rail === "bank_transfer") return "Bank transfer";
  if (method && method in METHOD_LABEL) return METHOD_LABEL[method as PaymentMethodValue];
  return rail || method || "Payment";
}

export const CREDIT_REPAYMENT_RAILS = POS_PAYMENT_RAILS.filter((rail) => rail.value !== "credit");

export type SaleTenderDraft = {
  rail: string;
  amount: number;
  currency?: string;
  amountOriginal?: number;
};

export function tendersNeedCashDrawer(tenders: { rail: string }[]): boolean {
  return tenders.some((tender) => railToPaymentMethod(tender.rail) === "cash");
}

export function tendersNeedCustomer(tenders: { rail: string }[]): boolean {
  return tenders.some((tender) => railToPaymentMethod(tender.rail) === "credit");
}

export function tendersAllocated(tenders: { amount: number }[]): number {
  return tenders.reduce((sum, tender) => sum + (Number(tender.amount) || 0), 0);
}

export function tendersLabel(
  tenders: { rail: string; amount?: number }[],
  fallback?: string,
): string {
  const labels = tenders
    .filter((tender) => tender.rail)
    .map((tender) => paymentRailLabel(tender.rail));
  if (labels.length === 0) return fallback || "Payment";
  return [...new Set(labels)].join(" + ");
}
