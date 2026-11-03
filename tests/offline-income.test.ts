import { describe, expect, it } from "vitest";
import { shouldPersistPosDraft } from "@/lib/offline/db";
import { parseLowDataPreference, resolveLowDataEnabled } from "@/lib/offline/low-data";
import { formatStockLeftLabel, OFFLINE_STOCK_HINT } from "@/lib/offline/stock-label";

describe("POS cart snapshot", () => {
  it("persists only when the cart has items", () => {
    expect(shouldPersistPosDraft(0)).toBe(false);
    expect(shouldPersistPosDraft(1)).toBe(true);
  });
});

describe("offline stock honesty", () => {
  it("labels live counts without estimate copy", () => {
    expect(formatStockLeftLabel(12, "kg", String, false)).toBe("12 kg left");
    expect(formatStockLeftLabel(0, "kg", String, false)).toBe("Out of stock");
  });

  it("labels cached counts as estimates", () => {
    expect(formatStockLeftLabel(12, "kg", String, true)).toBe("About 12 kg left (estimate)");
    expect(formatStockLeftLabel(0, "kg", String, true)).toBe("Out of stock (estimate)");
    expect(OFFLINE_STOCK_HINT).toMatch(/estimate/i);
  });
});

describe("low-data preference", () => {
  it("defaults unknown values to auto", () => {
    expect(parseLowDataPreference(null)).toBe("auto");
    expect(parseLowDataPreference("wifi")).toBe("auto");
    expect(parseLowDataPreference("on")).toBe("on");
    expect(parseLowDataPreference("off")).toBe("off");
  });

  it("resolves auto from the Save-Data hint", () => {
    expect(resolveLowDataEnabled("auto", true)).toBe(true);
    expect(resolveLowDataEnabled("auto", false)).toBe(false);
    expect(resolveLowDataEnabled("on", false)).toBe(true);
    expect(resolveLowDataEnabled("off", true)).toBe(false);
  });
});
