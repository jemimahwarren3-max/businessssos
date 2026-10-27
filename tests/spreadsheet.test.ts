import { describe, expect, it } from "vitest";
import { matchColumns, parseCsvText, rowsToRecords } from "@/lib/spreadsheet";

const productColumns = [
  { key: "name", label: "Name", required: true, aliases: ["product"] },
  { key: "stock", label: "Stock", required: false, aliases: ["soh", "stockonhand"] },
];

describe("spreadsheet import parsing", () => {
  it("parses quoted commas and escaped quotes while sanitizing embedded newlines", () => {
    expect(parseCsvText('Name,Stock\r\n"Tea, green",3\r\n"Tea ""special""",4')).toEqual([
      ["Name", "Stock"],
      ["Tea, green", "3"],
      ['Tea "special"', "4"],
    ]);
    expect(parseCsvText('Name,Stock\n"First line\nsecond line",2')).toEqual([
      ["Name", "Stock"],
      ["First linesecond line", "2"],
    ]);
  });

  it("matches common stock headers regardless of spaces, underscores, or case", () => {
    expect(matchColumns(["PRODUCT", "Stock On Hand"], productColumns)).toEqual({
      name: 0,
      stock: 1,
    });
  });

  it("reports missing required columns and maps optional stock values", () => {
    expect(rowsToRecords([["Stock"], ["4"]], productColumns)).toEqual({
      records: [],
      missingRequired: ["Name"],
    });
    expect(
      rowsToRecords(
        [
          ["Product", "SOH"],
          ["Rice", "12"],
        ],
        productColumns,
      ),
    ).toEqual({
      records: [{ name: "Rice", stock: "12" }],
      missingRequired: [],
    });
  });
});
