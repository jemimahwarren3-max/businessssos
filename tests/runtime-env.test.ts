import { describe, expect, it } from "vitest";
import { assertProductionRuntimeEnv } from "@/lib/runtime-env.server";

describe("production runtime env", () => {
  it("does not throw outside production", () => {
    expect(assertProductionRuntimeEnv({}, "test")).toEqual([]);
  });

  it("lists missing production variables", () => {
    expect(() => assertProductionRuntimeEnv({}, "production")).toThrow(/APP_URL/);
  });

  it("accepts a complete production set", () => {
    expect(
      assertProductionRuntimeEnv(
        {
          APP_URL: "https://example.com",
          SESSION_SECRET: "x".repeat(32),
          SUPABASE_URL: "https://example.supabase.co",
          SUPABASE_PUBLISHABLE_KEY: "pub",
          SUPABASE_SERVICE_ROLE_KEY: "role",
        },
        "production",
      ),
    ).toEqual([]);
  });
});
