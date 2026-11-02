import type { LineItemInput } from "./business.schemas";
import { formatMoney } from "./format";

/** E.164-ish digits for Graph / wa.me. Contacts here are almost always a
 * local Zimbabwe number (e.g. "0771234567"). A leading 0 is treated as the
 * trunk prefix and rewritten to 263. Numbers that already carry a country
 * code pass through as digits. A wrong guess on a wa.me link is a dead
 * chat, not a misfire — Cloud send still requires a Graph message id. */
export function toWhatsAppAddress(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length < 7) return null;
  return digits.startsWith("0") ? `263${digits.slice(1)}` : digits;
}

export function buildWhatsAppLink(
  phone: string | null | undefined,
  message: string,
): string | null {
  const international = toWhatsAppAddress(phone);
  if (!international) return null;
  return `https://wa.me/${international}?text=${encodeURIComponent(message)}`;
}

/** Opens WhatsApp with a pre-filled message. If no phone is on file the
 * user picks a chat themselves. Nothing is auto-sent. */
export function buildWhatsAppShareUrl(message: string, phone?: string | null): string {
  return buildWhatsAppLink(phone, message) ?? `https://wa.me/?text=${encodeURIComponent(message)}`;
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

export function buildProductWhatsAppMessage(input: {
  businessName: string;
  productName: string;
  price: number;
  currency: string;
  availability: string;
  url?: string | null;
}): string {
  const lines = [
    `${input.productName} from ${input.businessName}`,
    `Price: ${formatMoney(input.price, input.currency)}`,
    `Availability: ${input.availability}`,
  ];
  if (input.url) lines.push(input.url);
  return lines.join("\n");
}

export function buildSaleReceiptWhatsAppMessage(input: {
  businessName: string;
  receiptNumber: string;
  items: { name: string; quantity: number; unitPrice: number }[];
  total: number;
  currency: string;
  paymentMethod: string;
}): string {
  const itemLines = input.items
    .map(
      (item) =>
        `- ${item.quantity} x ${item.name} (${formatMoney(item.unitPrice, input.currency)})`,
    )
    .join("\n");
  return [
    `Receipt ${input.receiptNumber} from ${input.businessName}`,
    itemLines,
    `Paid: ${input.paymentMethod}`,
    `Total: ${formatMoney(input.total, input.currency)}`,
    "Thank you for your purchase.",
  ].join("\n\n");
}
