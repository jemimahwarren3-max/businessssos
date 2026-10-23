import { afterAll, beforeAll, expect, it } from "vitest";
import {
  asServiceRole,
  asUser,
  createTestBusiness,
  createTestUser,
  deleteTestBusiness,
  deleteTestUser,
  describeStaging,
  newId,
  sql,
} from "./helpers";

// Regression tests for the grant-leak bug found and fixed this session:
// `revoke all on function X from public` does not remove grants Supabase's
// default privileges separately hand to anon/authenticated on every new
// function — paynow_confirm_payment and the admin_* functions were
// callable by any signed-in (or anonymous) user until this was fixed.
describeStaging("billing security", () => {
  let ownerId: string;
  let businessId: string;
  const reference = `sec-test-${newId()}`;

  beforeAll(async () => {
    ownerId = await createTestUser(`billing-owner-${newId()}@example.com`);
    businessId = await createTestBusiness(ownerId, `Billing Security Test ${newId()}`);
    await asUser(
      ownerId,
      `select public.record_subscription_payment('${businessId}', '${reference}', 'business', 'month', 19, 'USD', 'https://example.com/poll');`,
    );
  }, 30_000);

  afterAll(async () => {
    await sql(`delete from public.subscription_payments where reference = '${reference}';`);
    await deleteTestBusiness(businessId);
    await deleteTestUser(ownerId);
  }, 30_000);

  it("paynow_confirm_payment cannot be called by an authenticated user directly (service_role only)", async () => {
    await expect(
      asUser(ownerId, `select public.paynow_confirm_payment('${reference}', null, 'Paid', true);`),
    ).rejects.toThrow(/permission denied/i);
  });

  it("none of the admin_* functions are callable by an authenticated user", async () => {
    await expect(asUser(ownerId, `select public.admin_platform_stats();`)).rejects.toThrow(
      /permission denied/i,
    );
    await expect(
      asUser(ownerId, `select * from public.admin_list_subscriptions();`),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asUser(
        ownerId,
        `select public.admin_override_subscription('${businessId}', 'pro', 'active', now(), 'test');`,
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it("paynow_confirm_payment is idempotent — a second confirmation doesn't re-extend the period", async () => {
    // The Management API's own connection runs as the postgres superuser,
    // which bypasses grants but not this function's internal
    // current_user = 'service_role' check — asServiceRole matches what
    // production's supabaseAdmin (PostgREST + service-role key) actually is.
    await asServiceRole(
      `select public.paynow_confirm_payment('${reference}', 'prov-ref', 'Paid', true);`,
    );
    const first = await sql<{ current_period_end: string }>(
      `select current_period_end from public.subscriptions where business_id = '${businessId}';`,
    );
    expect(first[0]?.current_period_end).toBeTruthy();

    await asServiceRole(
      `select public.paynow_confirm_payment('${reference}', 'prov-ref', 'Paid', true);`,
    );
    const second = await sql<{ current_period_end: string }>(
      `select current_period_end from public.subscriptions where business_id = '${businessId}';`,
    );
    expect(second[0]?.current_period_end).toBe(first[0]?.current_period_end);
  });
});
