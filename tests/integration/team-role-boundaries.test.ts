import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

describeStaging("team role boundaries", () => {
  let ownerId: string;
  let adminId: string;
  let managerId: string;
  let cashierId: string;
  let businessId: string;

  beforeAll(async () => {
    ownerId = await createTestUser(`team-owner-${newId()}@example.com`);
    adminId = await createTestUser(`team-admin-${newId()}@example.com`);
    managerId = await createTestUser(`team-manager-${newId()}@example.com`);
    cashierId = await createTestUser(`team-cashier-${newId()}@example.com`);
    businessId = await createTestBusiness(ownerId, `Team roles ${newId()}`);
    await sql(`
      insert into public.business_members (business_id, user_id, role)
      values
        ('${businessId}', '${adminId}', 'admin'),
        ('${businessId}', '${managerId}', 'manager'),
        ('${businessId}', '${cashierId}', 'cashier');
    `);
  }, 60_000);

  afterAll(async () => {
    if (businessId) await deleteTestBusiness(businessId);
    if (ownerId) await deleteTestUser(ownerId);
    if (adminId) await deleteTestUser(adminId);
    if (managerId) await deleteTestUser(managerId);
    if (cashierId) await deleteTestUser(cashierId);
  }, 30_000);

  it("allows owners to invite and rejects invite calls from admins and managers", async () => {
    const [invite] = await asUser<{ token: string }>(
      ownerId,
      `select public.create_business_invite('${businessId}', 'cashier') as token;`,
    );
    expect(invite?.token).toBeTruthy();

    await expect(
      asUser(adminId, `select public.create_business_invite('${businessId}', 'cashier');`),
    ).rejects.toThrow(/owner|permission/i);
    await expect(
      asUser(managerId, `select public.create_business_invite('${businessId}', 'cashier');`),
    ).rejects.toThrow(/owner|permission/i);
    await expect(
      asUser(ownerId, `select public.create_business_invite('${businessId}', 'owner');`),
    ).rejects.toThrow(/owner|permission/i);
  });

  it("prevents non-owners from promoting members or managing owner/admin accounts", async () => {
    await expect(
      asUser(
        adminId,
        `select public.update_team_member_role('${businessId}', '${cashierId}', 'admin');`,
      ),
    ).rejects.toThrow(/owner|permission/i);
    await expect(
      asUser(
        cashierId,
        `select public.update_team_member_role('${businessId}', '${managerId}', 'cashier');`,
      ),
    ).rejects.toThrow(/permission/i);
    await expect(
      asUser(
        adminId,
        `select public.update_team_member_role('${businessId}', '${ownerId}', 'manager');`,
      ),
    ).rejects.toThrow(/owner|permission/i);
    await expect(
      asUser(adminId, `select public.remove_team_member('${businessId}', '${ownerId}');`),
    ).rejects.toThrow(/owner|permission/i);
  });

  it("limits admin-role permission changes to owners", async () => {
    await expect(
      asUser(
        adminId,
        `select public.set_role_permission('${businessId}', 'admin', 'users.invite', false);`,
      ),
    ).rejects.toThrow(/owner|permission/i);
    await expect(
      asUser(
        cashierId,
        `select public.set_role_permission('${businessId}', 'manager', 'reports.financial', true);`,
      ),
    ).rejects.toThrow(/permission/i);

    await expect(
      asUser(
        adminId,
        `insert into public.business_role_permissions (business_id, role, permission_key)
         values ('${businessId}', 'admin', 'users.invite');`,
      ),
    ).rejects.toThrow(/permission|policy/i);

    await expect(
      asUser(
        ownerId,
        `select public.set_role_permission('${businessId}', 'admin', 'users.invite', true);`,
      ),
    ).resolves.toBeDefined();
  });

  it("blocks direct member writes that bypass the team RPCs", async () => {
    const uninvitedUserId = await createTestUser(`team-uninvited-${newId()}@example.com`);
    try {
      await expect(
        asUser(
          adminId,
          `insert into public.business_members (business_id, user_id, role)
           values ('${businessId}', '${uninvitedUserId}', 'cashier');`,
        ),
      ).rejects.toThrow(/permission|policy/i);

      await expect(
        asUser(
          ownerId,
          `update public.business_members set role = 'admin'
           where business_id = '${businessId}' and user_id = '${cashierId}';`,
        ),
      ).rejects.toThrow(/permission/i);
    } finally {
      await deleteTestUser(uninvitedUserId);
    }
  });

  it("prevents direct owner-role invitations through the table API", async () => {
    await expect(
      asUser(
        ownerId,
        `insert into public.business_invites (business_id, role, token, created_by, expires_at)
         values (
           '${businessId}',
           'owner',
           '${newId().replace(/-/g, "")}',
           '${ownerId}',
           now() + interval '7 days'
         );`,
      ),
    ).rejects.toThrow(/permission|policy/i);
  });

  it("allows owners to revoke an invite and refuses admin revocation", async () => {
    const [invite] = await asUser<{ token: string }>(
      ownerId,
      `select public.create_business_invite('${businessId}', 'manager') as token;`,
    );
    const [row] = await sql<{ id: string }>(
      `select id from public.business_invites where token = '${invite?.token}';`,
    );
    expect(row?.id).toBeTruthy();

    await expect(
      asUser(adminId, `select public.revoke_business_invite('${businessId}', '${row?.id}');`),
    ).rejects.toThrow(/owner|permission/i);

    await expect(
      asUser(ownerId, `select public.revoke_business_invite('${businessId}', '${row?.id}');`),
    ).resolves.toBeDefined();
  });

  it("blocks non-owners from reading pending invite tokens", async () => {
    await asUser(ownerId, `select public.create_business_invite('${businessId}', 'cashier');`);
    const invites = await asUser<{ token: string }>(
      adminId,
      `select token from public.business_invites where business_id = '${businessId}';`,
    );
    expect(invites).toHaveLength(0);
  });
});
