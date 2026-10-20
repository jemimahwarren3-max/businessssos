import { describe, expect, it } from "vitest";
import {
  createInviteSchema,
  createStaffAccountSchema,
  updateTeamMemberRoleSchema,
} from "@/lib/business.schemas";
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
});
