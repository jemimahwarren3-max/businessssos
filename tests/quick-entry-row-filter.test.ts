import { describe, expect, it } from "vitest";
import { isLikelyJunkQuickAddRow } from "../src/lib/quick-entry-row-filter";

describe("isLikelyJunkQuickAddRow", () => {
  it("flags totals, credits, and allergy lines", () => {
    expect(isLikelyJunkQuickAddRow("Total")).toBe(true);
    expect(isLikelyJunkQuickAddRow("Grand Total")).toBe(true);
    expect(isLikelyJunkQuickAddRow("Credits")).toBe(true);
    expect(isLikelyJunkQuickAddRow("Allergies: nuts")).toBe(true);
    expect(isLikelyJunkQuickAddRow("VAT Total")).toBe(true);
  });

  it("keeps ordinary product names", () => {
    expect(isLikelyJunkQuickAddRow("Mazoe Orange 2L")).toBe(false);
    expect(isLikelyJunkQuickAddRow("Blue Bar Soap")).toBe(false);
  });
});
