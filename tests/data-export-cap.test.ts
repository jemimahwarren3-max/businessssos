import { describe, expect, it } from "vitest";
import { EXPORT_ROW_CAP, enforceExportRowCap } from "../src/lib/data-export.server";

// Pure-function test — no DB, no live 100k-row seed needed. Confirms the
// reject-on-overflow branch: a business that somehow exceeds the cap gets a
// clear error, not a silently truncated (and therefore incomplete) export.

describe("enforceExportRowCap", () => {
  it("passes rows through unchanged when under the cap", () => {
    const rows = [{ id: "1" }, { id: "2" }];
    expect(enforceExportRowCap("sales", rows)).toBe(rows);
  });

  it("passes rows through when exactly at the cap", () => {
    const rows = Array.from({ length: EXPORT_ROW_CAP }, (_, i) => ({ id: String(i) }));
    expect(enforceExportRowCap("sales", rows)).toHaveLength(EXPORT_ROW_CAP);
  });

  it("throws a clear error instead of silently truncating when over the cap", () => {
    const rows = Array.from({ length: EXPORT_ROW_CAP + 1 }, (_, i) => ({ id: String(i) }));
    expect(() => enforceExportRowCap("sale_items", rows)).toThrow(/too much data/i);
  });
});
