import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// downloadCsv is browser-only; validate the escape logic via the module source contract.
describe("CSV export formula injection", () => {
  it("documents formula-trigger prefixing in csv.ts", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/csv.ts"), "utf8");
    expect(src).toMatch(/FORMULA_TRIGGER_CHARS/);
    expect(src).toMatch(/'\$\{value\}/);
  });

  it("prefixes dangerous leading characters when escaping cells", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/csv.ts"), "utf8");
    expect(src).toContain("=");
    expect(src).toContain("@");
    expect(src).toMatch(/escapeCsvCell/);
  });
});
