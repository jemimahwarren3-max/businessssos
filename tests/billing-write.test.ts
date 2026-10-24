import { afterEach, describe, expect, it } from "vitest";
import { canWriteForSubscription, canWriteWithPlatformEntitlement } from "@/lib/billing-write";
import { isBillingEnabled } from "@/lib/feature-flags.server";

const original = process.env["BILLING_ENABLED"];

afterEach(() => {
  if (original === undefined) delete process.env["BILLING_ENABLED"];
  else process.env["BILLING_ENABLED"] = original;
});

describe("billing write gate", () => {
  it("treats unset BILLING_ENABLED as billed (fail closed, not free by accident)", () => {
    delete process.env["BILLING_ENABLED"];
    expect(isBillingEnabled()).toBe(true);
    expect(canWriteForSubscription(null)).toBe(false);
  });

  it("lets every shop write while the free beta flag is on", () => {
    process.env["BILLING_ENABLED"] = "false";
    expect(isBillingEnabled()).toBe(false);
    expect(canWriteForSubscription(null)).toBe(true);
    expect(
      canWriteForSubscription({ status: "past_due", trial_ends_at: "2000-01-01T00:00:00.000Z" }),
    ).toBe(true);
  });

  it("allows active and unexpired trial rows when billed", () => {
    process.env["BILLING_ENABLED"] = "true";
    expect(canWriteForSubscription({ status: "active", trial_ends_at: null })).toBe(true);
    expect(
      canWriteForSubscription({
        status: "trialing",
        trial_ends_at: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    ).toBe(true);
  });

  it("locks expired trials and unknown statuses when billed", () => {
    process.env["BILLING_ENABLED"] = "true";
    expect(
      canWriteForSubscription({
        status: "trialing",
        trial_ends_at: "2000-01-01T00:00:00.000Z",
      }),
    ).toBe(false);
    expect(canWriteForSubscription({ status: "canceled", trial_ends_at: null })).toBe(false);
  });
});

describe("platform owner subscription entitlement", () => {
  it("allows writes when owner bypass is true even if subscription is expired", () => {
    process.env["BILLING_ENABLED"] = "true";
    expect(canWriteWithPlatformEntitlement({ status: "canceled", trial_ends_at: null }, true)).toBe(
      true,
    );
    expect(
      canWriteWithPlatformEntitlement({ status: "canceled", trial_ends_at: null }, false),
    ).toBe(false);
  });
});
