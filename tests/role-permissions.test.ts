import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const seed = readFileSync(
  join(process.cwd(), "supabase/migrations/20260818000000_granular_permissions.sql"),
  "utf8",
);

describe("default role permission seed", () => {
  it("lets cashiers sell, not open financial reports", () => {
    expect(seed).toMatch(/\('cashier'::public\.app_role, 'sales\.create'\)/);
    expect(seed).not.toMatch(/\('cashier'::public\.app_role, 'reports\.financial'\)/);
    expect(seed).not.toMatch(/\('cashier'::public\.app_role, 'expenses\.create'\)/);
  });

  it("gives owner-adjacent roles reports.financial", () => {
    expect(seed).toMatch(/\('admin'::public\.app_role, 'reports\.financial'\)/);
    expect(seed).toMatch(/\('manager'::public\.app_role, 'reports\.financial'\)/);
    expect(seed).toMatch(/\('accountant'::public\.app_role, 'reports\.financial'\)/);
  });
});
