import { describe, expect, it } from "vitest";
import {
  isSubscriptionCurrency,
  planAmountForCurrency,
  planAmountUsd,
  PLAN_MONTHLY_ZWG,
} from "../src/lib/billing-plans";

describe("subscription currency pricing", () => {
  it("uses the fixed monthly price for each supported currency", () => {
    expect(planAmountUsd("pro")).toBe(7);
    expect(planAmountForCurrency("pro", "USD")).toBe(7);
    expect(planAmountForCurrency("pro", "ZWG")).toBe(210);
    expect(PLAN_MONTHLY_ZWG.pro).toBe(210);
  });

  it("accepts only the supported subscription currencies", () => {
    expect(isSubscriptionCurrency("USD")).toBe(true);
    expect(isSubscriptionCurrency("ZWG")).toBe(true);
    expect(isSubscriptionCurrency("ZWL")).toBe(false);
    expect(isSubscriptionCurrency("EUR")).toBe(false);
  });
});
