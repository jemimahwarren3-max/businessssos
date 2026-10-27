import { describe, expect, it } from "vitest";
import { BRAND } from "@/lib/brand";
import { PLAN_MONTHLY_USD } from "@/lib/billing-plans";
import { STORE_TEMPLATES } from "@/lib/storefront/templates";

describe("Kwetuu public site contract", () => {
  it("keeps the live brand and ten shop templates", () => {
    expect(BRAND.name).toBe("Kwetuu");
    expect(BRAND.domain).toBe("mykwetuu.com");
    expect(STORE_TEMPLATES).toHaveLength(10);
    expect(PLAN_MONTHLY_USD.pro).toBe(3);
  });
});
