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

describeStaging("platform support access consent", () => {
  let owner: string;
  let admin: string;
  let businessId: string;
  let requestId: string;

  beforeAll(async () => {
    owner = await createTestUser(`access-owner-${newId()}@example.com`);
    admin = await createTestUser(`access-admin-${newId()}@example.com`);
    businessId = await createTestBusiness(owner, `Access ${newId()}`);
  }, 60_000);

  afterAll(async () => {
    if (businessId) await deleteTestBusiness(businessId);
    if (owner) await deleteTestUser(owner);
    if (admin) await deleteTestUser(admin);
  }, 30_000);

  it("refuses an admin session until the merchant approves", async () => {
    await expect(
      sql(`select public.admin_start_impersonation('${admin}', '${businessId}', 'Ticket 1', 30);`),
    ).rejects.toThrow(/has not approved support access/i);
  });

  it("records a pending request and shows it to the owner", async () => {
    const [created] = await sql<{ admin_request_business_access: string }>(
      `select public.admin_request_business_access('${admin}', '${businessId}', 'Ticket 1') as admin_request_business_access;`,
    );
    requestId = created!.admin_request_business_access;

    const rows = await asUser<{ id: string; status: string }>(
      owner,
      `select id, status from public.business_list_access_requests('${businessId}');`,
    );
    expect(rows).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: requestId, status: "pending" })]),
    );
  });

  it("does not let a non-member see or decide requests", async () => {
    await expect(
      asUser(admin, `select * from public.business_list_access_requests('${businessId}');`),
    ).rejects.toThrow(/owner or admin/i);
    await expect(
      asUser(admin, `select public.business_decide_access_request('${requestId}', true, 2);`),
    ).rejects.toThrow(/owner or admin/i);
  });

  it("starts a session only after the owner approves, capped to the approval", async () => {
    await asUser(owner, `select public.business_decide_access_request('${requestId}', true, 2);`);

    const [started] = await sql<{ admin_start_impersonation: string }>(
      `select public.admin_start_impersonation('${admin}', '${businessId}', 'Ticket 1', 240) as admin_start_impersonation;`,
    );
    expect(started!.admin_start_impersonation).toBeTruthy();

    const [active] = await sql<{ expires: string }>(
      `select expires_at::text as expires from public.platform_impersonation_sessions
       where admin_user_id = '${admin}' and business_id = '${businessId}' and ended_at is null
       order by started_at desc limit 1;`,
    );
    expect(active).toBeDefined();
    const approvalExpiry = new Date(active!.expires).getTime();
    expect(approvalExpiry).toBeLessThanOrEqual(Date.now() + 2 * 60 * 60 * 1000 + 60_000);
  });

  it("ends the session when the owner ends access", async () => {
    await asUser(owner, `select public.business_end_platform_access('${businessId}');`);

    const [after] = await sql<{ n: number }>(
      `select count(*)::int as n from public.platform_impersonation_sessions
       where admin_user_id = '${admin}' and business_id = '${businessId}'
         and ended_at is null and expires_at > now();`,
    );
    expect(after!.n).toBe(0);
  });
});
