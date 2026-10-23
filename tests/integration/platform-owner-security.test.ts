import { afterAll, beforeAll, expect, it } from "vitest";
import { asUser, createTestUser, deleteTestUser, describeStaging, newId, sql } from "./helpers";

describeStaging("platform owner security", () => {
  let userId: string;

  beforeAll(async () => {
    userId = await createTestUser(`platform-owner-check-${newId()}@example.com`);
  }, 30_000);

  afterAll(async () => {
    await deleteTestUser(userId);
  }, 30_000);

  it("does not grant ordinary authenticated users platform subscription bypass", async () => {
    const rows = await asUser<{ has_platform_subscription_bypass: boolean }>(
      userId,
      "select public.has_platform_subscription_bypass();",
    );
    expect(rows[0]?.has_platform_subscription_bypass).toBe(false);
  });

  it("does not allow authenticated users to assign platform roles or entitlements", async () => {
    await expect(
      asUser(
        userId,
        `insert into public.platform_roles (user_id, role, reason) values ('${userId}', 'super_admin', 'test');`,
      ),
    ).rejects.toThrow();
    await expect(
      asUser(
        userId,
        `insert into public.platform_entitlements (user_id, entitlement, reason) values ('${userId}', 'owner_subscription_bypass', 'test');`,
      ),
    ).rejects.toThrow();
  });

  it("does not expose the one-time bootstrap function to authenticated callers", async () => {
    await expect(
      asUser(userId, "select public.bootstrap_platform_owner('nobody@example.com');"),
    ).rejects.toThrow();
  });

  it("does not expose service-role admin checks to authenticated callers", async () => {
    await expect(
      asUser(userId, `select public.platform_admin_access('${userId}');`),
    ).rejects.toThrow();
  });
});
