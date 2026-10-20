export const FULFILMENT_STATUSES = [
  "awaiting_confirmation",
  "confirmed",
  "preparing",
  "ready",
  "out_for_delivery",
  "completed",
  "cancelled",
] as const;

export type FulfilmentStatus = (typeof FULFILMENT_STATUSES)[number];

export type OrderAction =
  "confirm" | "accept" | "preparing" | "ready" | "dispatch" | "complete" | "cancel" | "mark_paid";

export function fulfilmentActions(input: {
  fulfilmentStatus: string;
  fulfilmentMethod: string;
  paymentMethod: string;
  paymentStatus: string;
  saleId: string | null;
}): OrderAction[] {
  if (input.fulfilmentStatus === "cancelled") return [];
  const actions: OrderAction[] = [];
  if (input.paymentStatus !== "paid" && input.saleId == null) {
    if (!(input.paymentMethod === "quote" && input.fulfilmentStatus === "awaiting_confirmation")) {
      actions.push("mark_paid");
    }
  }
  if (input.saleId == null) actions.push("cancel");
  if (input.paymentMethod === "quote" && input.fulfilmentStatus === "awaiting_confirmation") {
    actions.push("accept");
    return actions;
  }
  if (input.fulfilmentStatus === "awaiting_confirmation") actions.push("confirm");
  if (input.fulfilmentStatus === "confirmed") actions.push("preparing");
  if (input.fulfilmentStatus === "preparing") actions.push("ready");
  if (input.fulfilmentStatus === "ready" && input.fulfilmentMethod === "delivery") {
    actions.push("dispatch");
  }
  if (
    (input.fulfilmentStatus === "ready" && input.fulfilmentMethod !== "delivery") ||
    input.fulfilmentStatus === "out_for_delivery"
  ) {
    actions.push("complete");
  }
  return actions;
}

export const ACTION_LABEL: Record<OrderAction, string> = {
  confirm: "Confirm order",
  accept: "Accept quote",
  preparing: "Start preparing",
  ready: "Mark ready",
  dispatch: "Out for delivery",
  complete: "Mark completed",
  cancel: "Cancel order",
  mark_paid: "Record payment",
};
