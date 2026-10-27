import { formatMoney } from "@/lib/format";

export type OrderEmailTemplateKey =
  | "customer.order.placed"
  | "customer.order.status"
  | "customer.payment.updated"
  | "merchant.order.event";

export type OrderEmailItem = {
  name: string;
  quantity: number;
  lineTotal: number;
};

export type OrderEmailContext = {
  storeName: string;
  storeSlug: string;
  orderReference: string;
  customerName: string;
  currency: string;
  subtotal: number;
  deliveryFee: number;
  tax: number;
  total: number;
  fulfilmentMethod: string;
  fulfilmentStatus: string;
  paymentMethod: string;
  paymentStatus: string;
  eventMessage?: string;
  eventType?: string;
  accessToken?: string;
  orderUrl?: string;
  platformName: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function statusHeadline(ctx: OrderEmailContext, audience: "customer" | "merchant"): string {
  if (ctx.eventType === "cancelled") return "Order cancelled";
  if (ctx.eventType === "paid" || ctx.paymentStatus === "paid") return "Payment update";
  if (ctx.eventType === "created")
    return audience === "merchant" ? "New online order" : "Order received";
  if (ctx.fulfilmentStatus === "ready") return "Ready for collection";
  if (ctx.fulfilmentStatus === "out_for_delivery") return "Order dispatched";
  if (ctx.fulfilmentStatus === "completed") return "Order completed";
  if (ctx.fulfilmentStatus === "confirmed") return "Order confirmed";
  return "Order update";
}

function buildPlainItems(items: OrderEmailItem[], currency: string): string {
  if (items.length === 0) return "";
  return items
    .map((line) => `${line.quantity} × ${line.name} — ${formatMoney(line.lineTotal, currency)}`)
    .join("\n");
}

export function renderOrderEmail(input: {
  template: OrderEmailTemplateKey;
  audience: "customer" | "merchant";
  ctx: OrderEmailContext;
  items: OrderEmailItem[];
}): { subject: string; text: string; html: string } {
  const { ctx, items, audience, template } = input;
  const headline = statusHeadline(ctx, audience);
  const subject =
    template === "customer.order.placed"
      ? `Order ${ctx.orderReference} at ${ctx.storeName}`
      : `${headline}: ${ctx.orderReference} · ${ctx.storeName}`;

  const itemsPlain = buildPlainItems(items, ctx.currency);
  const paidLabel = ctx.paymentStatus === "paid" ? "Paid" : "Not paid yet";

  const textParts = [
    `Hello ${ctx.customerName},`,
    "",
    headline,
    "",
    `Store: ${ctx.storeName}`,
    `Order: ${ctx.orderReference}`,
    `Total: ${formatMoney(ctx.total, ctx.currency)}`,
    `Fulfilment: ${ctx.fulfilmentMethod} (${ctx.fulfilmentStatus})`,
    `Payment: ${ctx.paymentMethod} — ${paidLabel}`,
  ];
  if (ctx.eventMessage) textParts.push("", ctx.eventMessage);
  if (itemsPlain) textParts.push("", "Items:", itemsPlain);
  if (ctx.orderUrl) textParts.push("", `View order: ${ctx.orderUrl}`);
  if (template === "customer.order.placed" && ctx.accessToken) {
    textParts.push(
      "",
      `Access code (shown once): ${ctx.accessToken}`,
      "Use this code if you are not signed in. Keep it private.",
    );
  }
  textParts.push("", "This is a transactional message about your order. It is not marketing.");

  const htmlItems = items
    .map(
      (line) =>
        `<tr><td style="padding:6px 0">${escapeHtml(line.name)}</td><td align="right">${line.quantity}</td><td align="right">${escapeHtml(formatMoney(line.lineTotal, ctx.currency))}</td></tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111;max-width:560px;margin:0 auto;padding:16px">
  <p style="color:#666;font-size:13px">${escapeHtml(ctx.platformName)}</p>
  <h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(headline)}</h1>
  <p><strong>${escapeHtml(ctx.storeName)}</strong><br/>Order <strong>${escapeHtml(ctx.orderReference)}</strong></p>
  <p>Total: <strong>${escapeHtml(formatMoney(ctx.total, ctx.currency))}</strong><br/>
  Fulfilment: ${escapeHtml(ctx.fulfilmentMethod)} (${escapeHtml(ctx.fulfilmentStatus)})<br/>
  Payment: ${escapeHtml(ctx.paymentMethod)} — ${escapeHtml(paidLabel)}</p>
  ${ctx.eventMessage ? `<p>${escapeHtml(ctx.eventMessage)}</p>` : ""}
  ${items.length > 0 ? `<table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eee;margin-top:12px"><tbody>${htmlItems}</tbody></table>` : ""}
  ${ctx.orderUrl ? `<p style="margin-top:16px"><a href="${escapeHtml(ctx.orderUrl)}">View your order</a></p>` : ""}
  ${template === "customer.order.placed" && ctx.accessToken ? `<p style="margin-top:12px;font-size:13px"><strong>Access code (shown once):</strong> ${escapeHtml(ctx.accessToken)}</p>` : ""}
  <p style="margin-top:24px;font-size:12px;color:#666">Transactional order message — not marketing.</p>
</body></html>`;

  return { subject: subject.slice(0, 120), text: textParts.join("\n"), html };
}
