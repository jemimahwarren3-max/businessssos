import { describe, expect, it } from "vitest";
import {
  filterOrderDeskRows,
  fulfilmentStatusLabel,
  matchesOrderDeskFilter,
} from "@/lib/storefront/order-desk";

const sample = {
  id: "1",
  reference: "ON-0001",
  createdAt: "2026-01-01T10:00:00.000Z",
  customerName: "Tariro",
  customerPhone: "+263771234567",
  total: 20,
  currency: "USD",
  paymentStatus: "unpaid",
  fulfilmentStatus: "awaiting_confirmation",
  paymentMethod: "manual",
  fulfilmentMethod: "pickup",
  saleId: null,
  itemCount: 1,
  itemSummary: "Bread",
};

describe("order desk filters", () => {
  it("labels fulfilment statuses for the seller desk", () => {
    expect(fulfilmentStatusLabel("awaiting_confirmation")).toBe("New");
    expect(fulfilmentStatusLabel("out_for_delivery")).toBe("Out for delivery");
  });

  it("filters by status and search query", () => {
    expect(matchesOrderDeskFilter(sample, "new")).toBe(true);
    expect(matchesOrderDeskFilter({ ...sample, fulfilmentStatus: "completed" }, "new")).toBe(false);
    const rows = filterOrderDeskRows(
      [sample, { ...sample, id: "2", reference: "ON-0002", customerName: "Other" }],
      { filter: "all", query: "tariro" },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.reference).toBe("ON-0001");
  });
});
