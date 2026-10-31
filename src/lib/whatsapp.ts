import type { LineItemInput } from "./business.schemas";
import { formatMoney } from "./format";

/** wa.me needs a full international number, digits only. Contacts here are
 * almost always stored as a local Zimbabwe number (e.g. "0771234567", no
 * country code) since this app's users are in Zimbabwe — a leading 0 is
 * treated as the local trunk prefix and rewritten to +263. This is a
 * heuristic, not a phone-parsing library: numbers that already carry a
 * country code (leading "+" or already 263...) pass through untouched.
 * Nothing is auto-sent — WhatsApp opens with the message pre-filled and the
 * user still has to hit send, so a wrong guess here is just a dead link,
 * not a misfire. */
export function buildWhatsAppLink(
  phone: string | null | undefined,
  message: string,
): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, "");
  if (!digits) return null;
  const international = digits.startsWith("0") ? `263${digits.slice(1)}` : digits;
  return `https://wa.me/${international}?text=${encodeURIComponent(message)}`;
}

type OrderTotals = { subtotal: number; tax: number; total: number };

function itemLines(items: LineItemInput[], currency: string, priceLabel: string): string {
  return items
    .filter((item) => item.name.trim())
    .map(
      (item) =>
        `- ${item.quantity} x ${item.name} (${priceLabel} ${formatMoney(item.unitPrice, currency)})`,
    )
    .join("\n");
}

/** Customer-facing — sent after creating a real Quote. */
export function buildQuoteWhatsAppMessage(
  customerName: string,
  businessName: string,
  items: LineItemInput[],
  totals: OrderTotals,
  currency: string,
): string {
  return [
    `Hi ${customerName}, here's your order from ${businessName}:`,
    itemLines(items, currency, "@"),
    `Total: ${formatMoney(totals.total, currency)}`,
    "Let us know if you'd like to go ahead!",
  ].join("\n\n");
}

/** Sent by an owner/admin to a prospective teammate, alongside a generated
 * invite link — nothing is auto-sent, same as every other WhatsApp message
 * built here. */
export function buildInviteWhatsAppMessage(
  businessName: string,
  roleLabel: string,
  link: string,
): string {
  return [
    `You're invited to join ${businessName} on Kwetuu as ${roleLabel}.`,
    `Open this link to accept: ${link}`,
  ].join("\n\n");
}

/** Supplier-facing — sent after creating a Purchase Order. Explicitly notes
 * prices are estimates, since a supplier's actual price may differ from
 * what's on file. */
export function buildPurchaseOrderWhatsAppMessage(
  supplierContactName: string,
  businessName: string,
  items: LineItemInput[],
  totals: OrderTotals,
  currency: string,
): string {
  return [
    `Hi ${supplierContactName}, we'd like to order the following from ${businessName}:`,
    itemLines(items, currency, "est."),
    `Estimated total: ${formatMoney(totals.total, currency)}`,
    "Please confirm availability and current pricing.",
  ].join("\n\n");
}
