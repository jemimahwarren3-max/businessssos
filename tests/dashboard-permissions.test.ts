import { describe, expect, it, vi } from "vitest";
import { loadDashboard, type Db } from "../src/lib/business.server";

describe("loadDashboard permissions", () => {
  it("does not load or return financial, expense, or stock data for a cashier", async () => {
    const businessQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { currency: "USD" },
        error: null,
      }),
    };
    const rpc = vi.fn(async (name: string) => ({
      data: name === "is_business_member" ? true : false,
      error: null,
    }));
    const from = vi.fn(() => businessQuery);
    const supabase = { rpc, from } as unknown as Db;

    const dashboard = await loadDashboard(supabase, "business-id", 7);

    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("businesses");
    expect(dashboard.todaySales).toBeNull();
    expect(dashboard.todayProfit).toBeNull();
    expect(dashboard.todayExpenses).toBeNull();
    expect(dashboard.todayEstimatedProfit).toBeNull();
    expect(dashboard.lowStock).toEqual([]);
    expect(dashboard.series).toEqual([]);
    expect(dashboard.debtors).toEqual([]);
    expect(dashboard.todayTakings.received).toEqual([]);
  });
});
