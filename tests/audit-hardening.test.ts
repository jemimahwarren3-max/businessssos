import { describe, expect, it } from "vitest";
import { canWriteForSubscription } from "@/lib/business.server";
import { canWriteWithPlatformEntitlement } from "@/lib/billing-write";
import {
  createInviteSchema,
  createStaffAccountSchema,
  staffLoginSchema,
  updateTeamMemberRoleSchema,
} from "@/lib/business.schemas";
import { clientIpFromForwarded } from "@/lib/request-ip";
import { configuredPlatformOrigin } from "@/lib/storefront/host";
import { paymentHowLabel } from "@/lib/storefront/receipt";

describe("audit hardening contracts", () => {
  it("refuses owner on invites and staff logins", () => {
    expect(
      createInviteSchema.safeParse({
        businessId: "11111111-1111-1111-1111-111111111111",
        role: "owner",
      }).success,
    ).toBe(false);
    expect(
      createStaffAccountSchema.safeParse({
        businessId: "11111111-1111-1111-1111-111111111111",
        displayName: "Till one",
        password: "longenough",
        role: "owner",
      }).success,
    ).toBe(false);
    expect(
      createInviteSchema.parse({
        businessId: "11111111-1111-1111-1111-111111111111",
        role: "cashier",
      }).role,
    ).toBe("cashier");
  });

  it("still lets an owner transfer the owner role through the role-change schema", () => {
    expect(
      updateTeamMemberRoleSchema.parse({
        businessId: "11111111-1111-1111-1111-111111111111",
        memberUserId: "22222222-2222-2222-2222-222222222222",
        role: "owner",
      }).role,
    ).toBe("owner");
  });

  it("does not call Paynow sales cash on the shared receipt", () => {
    expect(paymentHowLabel("paynow", true)).toMatch(/Paynow/);
    expect(paymentHowLabel("paynow", true)).not.toMatch(/cash on/i);
  });

  it("fails closed when billing is on and there is no subscription row", () => {
    const previous = process.env["BILLING_ENABLED"];
    try {
      delete process.env["BILLING_ENABLED"];
      expect(canWriteForSubscription(null)).toBe(false);
      process.env["BILLING_ENABLED"] = "false";
      expect(canWriteForSubscription(null)).toBe(true);
    } finally {
      if (previous === undefined) delete process.env["BILLING_ENABLED"];
      else process.env["BILLING_ENABLED"] = previous;
    }
  });

  it("uses a separate owner entitlement without changing subscription billing state", () => {
    const expiredSubscription = {
      status: "past_due",
      trial_ends_at: "2020-01-01T00:00:00.000Z",
    };
    expect(canWriteWithPlatformEntitlement(expiredSubscription, true)).toBe(true);
    expect(canWriteWithPlatformEntitlement(expiredSubscription, false)).toBe(false);
    expect(canWriteWithPlatformEntitlement(null, false)).toBe(false);
  });

  it("prefers runtime APP_URL over a baked Vite origin", () => {
    const previous = process.env["APP_URL"];
    try {
      process.env["APP_URL"] = "https://runtime.example/";
      expect(configuredPlatformOrigin()).toBe("https://runtime.example");
    } finally {
      if (previous === undefined) delete process.env["APP_URL"];
      else process.env["APP_URL"] = previous;
    }
  });

  it("signs staff in with a password on the server, not an email round-trip", () => {
    expect(staffLoginSchema.safeParse({ businessName: "Shop", name: "Ada" }).success).toBe(false);
    expect(
      staffLoginSchema.parse({ businessName: "Shop", name: "Ada", password: "secret" }).name,
    ).toBe("Ada");
  });

  it("keys webhook rate limits on the first forwarded IP", () => {
    expect(clientIpFromForwarded("203.0.113.9, 10.0.0.1", "10.0.0.2")).toBe("203.0.113.9");
    expect(clientIpFromForwarded("not-an-ip", "198.51.100.4")).toBe("198.51.100.4");
    expect(clientIpFromForwarded("evil", "also-bad")).toBe("unknown");
  });
});
