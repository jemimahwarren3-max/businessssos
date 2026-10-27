import type { AdminStore } from "@/lib/storefront/contract";

export type OrderListRow = AdminStore["orders"][number];

export type OrderDeskFilter =
  | "all"
  | "new"
  | "confirmed"
  | "preparing"
  | "ready"
  | "delivery"
  | "completed"
  | "cancelled"
  | "unpaid";

export const ORDER_DESK_FILTER_LABEL: Record<OrderDeskFilter, string> = {
  all: "All",
  new: "New",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  delivery: "Out for delivery",
  completed: "Completed",
  cancelled: "Cancelled",
  unpaid: "Awaiting payment",
};

export function fulfilmentStatusLabel(status: string): string {
  switch (status) {
    case "awaiting_confirmation":
      return "New";
    case "confirmed":
      return "Confirmed";
    case "preparing":
      return "Preparing";
    case "ready":
      return "Ready";
    case "out_for_delivery":
      return "Out for delivery";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    default:
      return status.replaceAll("_", " ");
  }
}

export function paymentStatusLabel(status: string): string {
  switch (status) {
    case "unpaid":
      return "Awaiting payment";
    case "pending":
      return "Pending verification";
    case "paid":
      return "Paid";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    case "expired":
      return "Expired";
    case "refunded":
      return "Refunded";
    default:
      return status;
  }
}

export function matchesOrderDeskFilter(order: OrderListRow, filter: OrderDeskFilter): boolean {
  if (filter === "all") return true;
  if (filter === "unpaid") {
    return order.paymentStatus !== "paid" && order.fulfilmentStatus !== "cancelled";
  }
  if (filter === "cancelled") return order.fulfilmentStatus === "cancelled";
  if (filter === "completed") return order.fulfilmentStatus === "completed";
  if (filter === "delivery") return order.fulfilmentStatus === "out_for_delivery";
  if (filter === "ready") return order.fulfilmentStatus === "ready";
  if (filter === "preparing") return order.fulfilmentStatus === "preparing";
  if (filter === "confirmed") return order.fulfilmentStatus === "confirmed";
  if (filter === "new") return order.fulfilmentStatus === "awaiting_confirmation";
  return true;
}

export function filterOrderDeskRows(
  orders: OrderListRow[],
  input: { query: string; filter: OrderDeskFilter },
): OrderListRow[] {
  const q = input.query.trim().toLowerCase();
  return orders.filter((order) => {
    if (!matchesOrderDeskFilter(order, input.filter)) return false;
    if (!q) return true;
    const haystack = [
      order.reference,
      order.customerName,
      order.customerPhone,
      order.itemSummary ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function sortOrderDeskRows(orders: OrderListRow[]): OrderListRow[] {
  return [...orders].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}
