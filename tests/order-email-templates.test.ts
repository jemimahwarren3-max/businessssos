import { describe, expect, it } from "vitest";
import { renderOrderEmail } from "@/lib/notifications/order-email-templates";

const baseCtx = {
  storeName: "Harare Bakes",
  storeSlug: "harare-bakes",
  orderReference: "ON-0042",
  customerName: "Tendai",
  subtotal: 10,
  deliveryFee: 2,
  tax: 0,
  fulfilmentMethod: "pickup",
  fulfilmentStatus: "confirmed",
  paymentMethod: "manual",
  paymentStatus: "unpaid",
  orderUrl: "https://app.kwetuu.test/store/harare-bakes/order/ON-0042",
  platformName: "Kwetuu",
};

describe("order email templates", () => {
  it("includes USD totals and order link for placed orders", () => {
    const { subject, text, html } = renderOrderEmail({
      template: "customer.order.placed",
      audience: "customer",
      ctx: { ...baseCtx, currency: "USD", total: 12 },
      items: [{ name: "Bread", quantity: 2, lineTotal: 10 }],
    });
    expect(subject).toContain("ON-0042");
    expect(subject).toContain("Harare Bakes");
    expect(text).toContain("$12.00");
    expect(text).toContain("View order:");
    expect(html).toContain("Bread");
    expect(html).not.toContain("<script");
  });

  it("formats ZiG currency from order data", () => {
    const { text } = renderOrderEmail({
      template: "customer.order.status",
      audience: "customer",
      ctx: {
        ...baseCtx,
        currency: "ZiG",
        total: 1500,
        fulfilmentStatus: "ready",
        eventType: "ready",
        eventMessage: "Your order is ready for collection.",
      },
      items: [],
    });
    expect(text).toMatch(/ZiG\s+1[,.]?500/);
    expect(text).toContain("ready for collection");
  });

  it("does not describe the order as paid unless payment status is paid", () => {
    const unpaid = renderOrderEmail({
      template: "customer.payment.updated",
      audience: "customer",
      ctx: { ...baseCtx, currency: "USD", total: 12, paymentStatus: "pending" },
      items: [],
    });
    expect(unpaid.text).toContain("Not paid yet");
    expect(unpaid.text).not.toMatch(/\bPaid\b.*Payment:/);

    const paid = renderOrderEmail({
      template: "customer.payment.updated",
      audience: "customer",
      ctx: { ...baseCtx, currency: "USD", total: 12, paymentStatus: "paid" },
      items: [],
    });
    expect(paid.text).toContain("Paid");
  });

  it("uses merchant headline for new orders", () => {
    const { subject, text } = renderOrderEmail({
      template: "merchant.order.event",
      audience: "merchant",
      ctx: {
        ...baseCtx,
        currency: "USD",
        total: 12,
        eventType: "created",
      },
      items: [{ name: "Roll", quantity: 1, lineTotal: 12 }],
    });
    expect(subject).toContain("New online order");
    expect(text).toContain("Roll");
  });

  it("shows access code only on placed template", () => {
    const placed = renderOrderEmail({
      template: "customer.order.placed",
      audience: "customer",
      ctx: { ...baseCtx, currency: "USD", total: 12, accessToken: "ABCD-1234" },
      items: [],
    });
    expect(placed.text).toContain("ABCD-1234");

    const status = renderOrderEmail({
      template: "customer.order.status",
      audience: "customer",
      ctx: {
        ...baseCtx,
        currency: "USD",
        total: 12,
        accessToken: "ABCD-1234",
        eventMessage: "Confirmed",
      },
      items: [],
    });
    expect(status.text).not.toContain("ABCD-1234");
  });
});
