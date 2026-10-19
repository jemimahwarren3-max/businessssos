import { friendlyDateTime } from "@/lib/format";
import type { CustomerOrder, PublicStore } from "./contract";

export type FulfilmentMethod = "pickup" | "delivery" | "quote";
export type PaymentMethod = "pay_on_pickup" | "pay_on_delivery" | "quote";

export function allowedFulfilments(
  store: Pick<PublicStore, "delivery" | "payments">,
): FulfilmentMethod[] {
  const methods: FulfilmentMethod[] = [];
  if (store.delivery.pickupEnabled) methods.push("pickup");
  if (store.delivery.deliveryEnabled && !store.delivery.quoteRequired) methods.push("delivery");
  if (store.payments.quotes || store.delivery.quoteRequired) methods.push("quote");
  return methods;
}

export function allowedPayments(
  store: Pick<PublicStore, "delivery" | "payments">,
  fulfilment: FulfilmentMethod,
): PaymentMethod[] {
  if (fulfilment === "quote") return ["quote"];
  const methods: PaymentMethod[] = [];
  if (fulfilment === "pickup" && store.payments.payOnPickup) methods.push("pay_on_pickup");
  if (fulfilment === "delivery" && store.payments.payOnDelivery && !store.delivery.quoteRequired) {
    methods.push("pay_on_delivery");
  }
  if (store.payments.quotes) methods.push("quote");
  return methods;
}

export function cashPolicyLines(store: Pick<PublicStore, "payments" | "currency">): string[] {
  const lines: string[] = [];
  const currencies = store.payments.cashCurrencies.trim() || store.currency;
  lines.push(`Cash accepted in ${currencies}.`);
  if (store.payments.exactCash) {
    lines.push("Bring the exact amount. This shop has not agreed to give change.");
  } else if (store.payments.changeProvided) {
    lines.push("This shop can give change when they have it.");
  }
  return lines;
}

export function orderDecisionCopy(store: Pick<PublicStore, "delivery">): string {
  if (store.delivery.autoAccept) {
    return "Eligible orders are accepted automatically. Payment is still recorded only when the shop receives it.";
  }
  return "The shop reviews each order before it is accepted.";
}

export function snapshotPolicyLines(
  order: Pick<CustomerOrder, "terms" | "currency" | "collectAt">,
): string[] {
  const terms = order.terms;
  if (!terms?.payments && !terms?.delivery) return [];
  const lines: string[] = [];
  const payments = terms.payments;
  const delivery = terms.delivery;
  if (payments) {
    const currencies = (payments.cashCurrencies ?? "").trim() || terms.currency || order.currency;
    lines.push(`Agreed cash: ${currencies}.`);
    if (payments.exactCash) {
      lines.push("Exact cash was required when this order was placed.");
    } else if (payments.changeProvided) {
      lines.push("The shop said it could give change when this order was placed.");
    }
  }
  if (delivery?.quoteRequired) {
    lines.push("Delivery was quoted, not a fixed fee, when this order was placed.");
  }
  if (typeof terms.deliveryFee === "number") {
    lines.push(`Agreed delivery fee: ${terms.deliveryFee} ${terms.currency ?? order.currency}.`);
  }
  const collectAt = order.collectAt ?? terms.collectAt;
  if (collectAt) {
    lines.push(`Agreed collection time: ${friendlyDateTime(collectAt)}.`);
  }
  return lines;
}
