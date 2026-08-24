import { describe, expect, it } from "vitest";
import { computeAnomalies, computeInventoryForecast } from "../src/lib/insights.server";

// Pure-function tests — no network, no staging project involved. The DB
// fetching around these functions (getInventoryForecast/getAnomalies) is
// boilerplate already covered by the same query patterns loadDashboard and
// loadReports use elsewhere; what's actually novel here is the math, so
// that's what's tested directly with fixture data.

describe("computeInventoryForecast", () => {
  it("flags a product already at zero stock as out, regardless of velocity", () => {
    const result = computeInventoryForecast(
      [{ id: "p1", name: "Widget", stock: 0, unit: "unit" }],
      new Map(),
    );
    expect(result).toEqual([
      {
        productId: "p1",
        name: "Widget",
        stock: 0,
        unit: "unit",
        dailyVelocity: 0,
        daysUntilStockout: 0,
        urgency: "out",
      },
    ]);
  });

  it("marks a product as critical when under 3 days of stock remain", () => {
    // 6 units in stock, 30 sold over 30 days -> velocity 1/day -> 6 days left... use 2 days.
    const result = computeInventoryForecast(
      [{ id: "p1", name: "Widget", stock: 2, unit: "unit" }],
      new Map([["p1", 30]]), // 1/day
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.urgency).toBe("critical");
    expect(result[0]!.daysUntilStockout).toBeCloseTo(2, 5);
  });

  it("marks a product as warning between 3 and 14 days of stock", () => {
    const result = computeInventoryForecast(
      [{ id: "p1", name: "Widget", stock: 10, unit: "unit" }],
      new Map([["p1", 30]]), // 1/day -> 10 days left
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.urgency).toBe("warning");
  });

  it("excludes a product with more than 14 days of stock remaining", () => {
    const result = computeInventoryForecast(
      [{ id: "p1", name: "Widget", stock: 100, unit: "unit" }],
      new Map([["p1", 30]]), // 1/day -> 100 days left
    );
    expect(result).toHaveLength(0);
  });

  it("excludes a product with stock but zero sale velocity", () => {
    const result = computeInventoryForecast(
      [{ id: "p1", name: "Widget", stock: 5, unit: "unit" }],
      new Map(),
    );
    expect(result).toHaveLength(0);
  });

  it("sorts by soonest stockout first", () => {
    const result = computeInventoryForecast(
      [
        { id: "far", name: "Far", stock: 10, unit: "unit" },
        { id: "out", name: "Out", stock: 0, unit: "unit" },
        { id: "near", name: "Near", stock: 2, unit: "unit" },
      ],
      new Map([
        ["far", 30], // 10 days
        ["near", 30], // 2 days
      ]),
    );
    expect(result.map((r) => r.productId)).toEqual(["out", "near", "far"]);
  });
});

describe("computeAnomalies", () => {
  const now = new Date("2026-08-12T12:00:00Z");

  function daysAgo(n: number) {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return d.toISOString();
  }

  it("flags a revenue drop of 30% or more with enough prior data", () => {
    const result = computeAnomalies({
      currency: "USD",
      now,
      sales: [
        { total: 1000, created_at: daysAgo(10) },
        { total: 1000, created_at: daysAgo(9) },
        { total: 1000, created_at: daysAgo(8) },
        { total: 100, created_at: daysAgo(1) },
      ],
      recentExpenses: [],
      categoryExpenses: [],
    });
    expect(result.some((a) => a.message.includes("Sales are down"))).toBe(true);
  });

  it("does not flag a revenue drop when last week had fewer than 3 sales", () => {
    const result = computeAnomalies({
      currency: "USD",
      now,
      sales: [
        { total: 1000, created_at: daysAgo(9) },
        { total: 100, created_at: daysAgo(1) },
      ],
      recentExpenses: [],
      categoryExpenses: [],
    });
    expect(result.some((a) => a.message.includes("Sales are down"))).toBe(false);
  });

  it("does not flag a normal, steady revenue week", () => {
    const result = computeAnomalies({
      currency: "USD",
      now,
      sales: [
        { total: 300, created_at: daysAgo(10) },
        { total: 300, created_at: daysAgo(9) },
        { total: 300, created_at: daysAgo(8) },
        { total: 300, created_at: daysAgo(3) },
        { total: 300, created_at: daysAgo(2) },
        { total: 300, created_at: daysAgo(1) },
      ],
      recentExpenses: [],
      categoryExpenses: [],
    });
    expect(result.some((a) => a.message.includes("Sales are down"))).toBe(false);
  });

  it("flags an expense spike of 50% or more", () => {
    const result = computeAnomalies({
      currency: "USD",
      now,
      sales: [],
      recentExpenses: [
        { amount: 100, category: "rent", vendor: null, expense_date: daysAgo(9).slice(0, 10) },
        { amount: 200, category: "rent", vendor: null, expense_date: daysAgo(1).slice(0, 10) },
      ],
      categoryExpenses: [],
    });
    expect(result.some((a) => a.message.includes("Expenses are up"))).toBe(true);
  });

  it("flags a single expense far above its category's trailing average", () => {
    const result = computeAnomalies({
      currency: "USD",
      now,
      sales: [],
      recentExpenses: [
        {
          amount: 900,
          category: "supplies",
          vendor: "Acme",
          expense_date: daysAgo(1).slice(0, 10),
        },
      ],
      categoryExpenses: [
        { amount: 100, category: "supplies" },
        { amount: 100, category: "supplies" },
        { amount: 100, category: "supplies" },
      ],
    });
    expect(result.some((a) => a.message.includes("Unusually large supplies expense"))).toBe(true);
  });

  it("does not flag a large expense when the category has fewer than 3 prior entries", () => {
    const result = computeAnomalies({
      currency: "USD",
      now,
      sales: [],
      recentExpenses: [
        {
          amount: 900,
          category: "supplies",
          vendor: "Acme",
          expense_date: daysAgo(1).slice(0, 10),
        },
      ],
      categoryExpenses: [
        { amount: 100, category: "supplies" },
        { amount: 100, category: "supplies" },
      ],
    });
    expect(result).toHaveLength(0);
  });

  it("returns no anomalies for a quiet, unremarkable week", () => {
    const result = computeAnomalies({
      currency: "USD",
      now,
      sales: [
        { total: 300, created_at: daysAgo(9) },
        { total: 300, created_at: daysAgo(8) },
        { total: 300, created_at: daysAgo(7) },
        { total: 300, created_at: daysAgo(3) },
        { total: 300, created_at: daysAgo(2) },
        { total: 300, created_at: daysAgo(1) },
      ],
      recentExpenses: [
        { amount: 100, category: "rent", vendor: null, expense_date: daysAgo(1).slice(0, 10) },
      ],
      categoryExpenses: [
        { amount: 100, category: "rent" },
        { amount: 100, category: "rent" },
        { amount: 100, category: "rent" },
      ],
    });
    expect(result).toHaveLength(0);
  });
});
