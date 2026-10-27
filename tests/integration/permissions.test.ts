import { afterAll, beforeAll, expect, it } from "vitest";
import {
  asUser,
  createTestBusiness,
  createTestUser,
  deleteTestBusiness,
  deleteTestUser,
  describeStaging,
  newId,
  sql,
} from "./helpers";

describeStaging("permissions", () => {
  let ownerId: string;
  let cashierId: string;
  let outsiderId: string;
  let businessId: string;

  beforeAll(async () => {
    ownerId = await createTestUser(`owner-${newId()}@example.com`);
    cashierId = await createTestUser(`cashier-${newId()}@example.com`);
    outsiderId = await createTestUser(`outsider-${newId()}@example.com`);
    businessId = await createTestBusiness(ownerId, `Permissions Test ${newId()}`);
    await sql(
      `insert into public.business_members (business_id, user_id, role) values ('${businessId}', '${cashierId}', 'cashier');`,
    );
  }, 30_000);

  afterAll(async () => {
    await sql(
      `delete from public.business_members where business_id = '${businessId}' and user_id = '${cashierId}';`,
    );
    await deleteTestBusiness(businessId);
    await deleteTestUser(ownerId);
    await deleteTestUser(cashierId);
    await deleteTestUser(outsiderId);
  }, 30_000);

  it("a cashier cannot start a subscription payment (owner/admin only)", async () => {
    await expect(
      asUser(
        cashierId,
        `select public.record_subscription_payment('${businessId}', 'perm-test-cashier-${newId()}', 'business', 'month', 19, 'USD', 'https://example.com/poll');`,
      ),
    ).rejects.toThrow(/only an owner or admin/i);
  });

  it("an owner can start a subscription payment", async () => {
    const reference = `perm-test-owner-${newId()}`;
    const rows = await asUser<{ id: string }>(
      ownerId,
      `select public.record_subscription_payment('${businessId}', '${reference}', 'business', 'month', 19, 'USD', 'https://example.com/poll') as id;`,
    );
    expect(rows[0]?.id).toBeTruthy();
    await sql(`delete from public.subscription_payments where reference = '${reference}';`);
  });

  it("a non-member reading the business's subscription gets zero rows, not an error", async () => {
    const rows = await asUser(
      outsiderId,
      `select * from public.subscriptions where business_id = '${businessId}';`,
    );
    expect(rows).toEqual([]);
  });

  // bootstrap_business_subscription() and the old 7-arg create_business_with_owner
  // overload were both dropped as orphaned/superseded during this session's
  // audit-fix pass (single-plan pricing, atomic business creation) — assert
  // they stay gone rather than silently reappearing via a future migration
  // that forgets this history.
  it("bootstrap_business_subscription no longer exists", async () => {
    const rows = await sql<{ exists: boolean }>(
      `select exists (select 1 from pg_proc where proname = 'bootstrap_business_subscription') as exists;`,
    );
    expect(rows[0]?.exists).toBe(false);
  });

  it("create_business_with_owner only has the current 5-argument signature", async () => {
    const rows = await sql<{ pronargs: number }>(
      `select pronargs from pg_proc where proname = 'create_business_with_owner';`,
    );
    expect(rows.map((r) => r.pronargs)).toEqual([5]);
  });
});
