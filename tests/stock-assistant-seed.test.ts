import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261109100000_stock_assistant_role.sql"),
  "utf8",
);

describe("stock_assistant role migration", () => {
  it("seeds view and adjust only for stock assistants", () => {
    expect(migration).toMatch(/\('stock_assistant'::public\.app_role, 'inventory\.view'\)/);
    expect(migration).toMatch(/\('stock_assistant'::public\.app_role, 'inventory\.adjust'\)/);
    expect(migration).not.toMatch(/\('stock_assistant'::public\.app_role, 'sales\.create'\)/);
    expect(migration).toMatch(/has_permission\(_business_id, 'inventory\.adjust'\)/);
  });
});
