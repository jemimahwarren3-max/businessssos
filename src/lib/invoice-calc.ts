import type { LineItemInput } from "./business.schemas";

function round2(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

/** Client-side preview only — the database function recomputes these
 * authoritatively on save, so a stale or tampered preview can't affect billing. */
export function computeTotals(items: LineItemInput[], discount: number) {
  let subtotal = 0;
  let tax = 0;
  for (const item of items) {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unitPrice) || 0;
    const lineSubtotal = round2(qty * price);
    const lineTax = round2((lineSubtotal * (Number(item.taxRate) || 0)) / 100);
    subtotal += lineSubtotal;
    tax += lineTax;
  }
  const total = Math.max(round2(subtotal) - (Number(discount) || 0) + round2(tax), 0);
  return { subtotal: round2(subtotal), tax: round2(tax), total: round2(total) };
}
