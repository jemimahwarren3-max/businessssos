import { describe, expect, it } from "vitest";
import {
  quickAddTextToRows,
  tryParseProductInventoryImport,
} from "../src/lib/quick-entry-inventory-sheet";

describe("quickAddTextToRows", () => {
  it("rebuilds a grid from Key=value rows produced by spreadsheet attach", () => {
    const text = `From file stock.xlsx:
Product=Mazoe Orange, SOH=24, Retail=3.50
Product=Blue Soap, Qty=10, Cost=1.20`;
    const rows = quickAddTextToRows(text);
    expect(rows[0]).toContain("Product");
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });
});

describe("tryParseProductInventoryImport", () => {
  it("detects inventory spreadsheets with SOH and no customer columns", () => {
    const text = `add inventory
Product=Mazoe Orange, SOH=24, Retail Price=3.50
Product=Blue Soap, Stock=10, Cost Price=1.20`;
    const result = tryParseProductInventoryImport(text);
    expect(result?.rows).toHaveLength(2);
    expect(result?.rows[0]?.name).toBe("Mazoe Orange");
    expect(result?.rows[0]?.stock).toBe(24);
  });

  it("skips totals and allergy footer lines when intent is inventory", () => {
    const text = `add inventory
Product=Mazoe, SOH=5
Product=Allergies, SOH=0
Product=Total, SOH=0
Product=Soap, SOH=3`;
    const result = tryParseProductInventoryImport(text, "inventory");
    expect(result?.rows.map((row) => row.name).sort()).toEqual(["Mazoe", "Soap"]);
    expect(result?.skippedJunk).toEqual(expect.arrayContaining(["Allergies", "Total"]));
  });

  it("does not inventory-parse when user chose sales", () => {
    const text = `Product=Mazoe, SOH=24`;
    expect(tryParseProductInventoryImport(text, "sales")).toBeNull();
  });

  it("skips obvious sale exports with customer column", () => {
    const text = `Customer=Mary, Product=Shirt, Qty=2, Amount=40`;
    expect(tryParseProductInventoryImport(text)).toBeNull();
  });
});
