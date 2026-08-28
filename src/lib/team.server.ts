import { AppError, assertPermission, dbFail, recordAudit, type Db } from "./business.server";
import { isPasswordBreached } from "./auth/breach-check.server";
import { createAnonClient } from "./auth/session.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BREACHED_PASSWORD_MESSAGE =
  "That password has appeared in known data breaches, so it's not safe to use. Please choose a different one.";

export type TeamMember = {
  id: string;
  user_id: string;
  role: string;
  email: string;
  full_name: string;
  staff_name: string | null;
  created_at: string;
};

export type InvitePreview = {
  business_name: string | null;
  role: string | null;
  valid: boolean;
  reason: string | null;
};

export type PendingInvite = {
  id: string;
  role: string;
  token: string;
  expires_at: string;
  created_at: string;
};

export async function listPendingInvites(
  supabase: Db,
  businessId: string,
): Promise<PendingInvite[]> {
  await assertPermission(supabase, businessId, "users.view");
  const { data, error } = await supabase
    .from("business_invites")
    .select("id, role, token, expires_at, created_at")
    .eq("business_id", businessId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) dbFail("list pending invites", error);
  return data ?? [];
}

export async function listTeamMembers(supabase: Db, businessId: string): Promise<TeamMember[]> {
  await assertPermission(supabase, businessId, "users.view");
  const { data, error } = await supabase.rpc("list_team_members", { _business_id: businessId });
  if (error) dbFail("list team members", error);
  return (data ?? []) as TeamMember[];
}

export async function createInvite(
  supabase: Db,
  userId: string,
  businessId: string,
  role: string,
): Promise<{ token: string }> {
  await assertPermission(supabase, businessId, "users.invite");
  const { data, error } = await supabase.rpc("create_business_invite", {
    _business_id: businessId,
    _role: role as never,
  });
  if (error || !data) dbFail("create invite", error);
  await recordAudit(supabase, {
    businessId,
    userId,
    action: "team.invited",
    entityType: "business_invite",
    summary: `Invited a new team member as ${role}`,
  });
  return { token: data as string };
}

export async function revokeInvite(
  supabase: Db,
  userId: string,
  businessId: string,
  inviteId: string,
): Promise<void> {
  await assertPermission(supabase, businessId, "users.invite");
  const { error } = await supabase.rpc("revoke_business_invite", {
    _business_id: businessId,
    _invite_id: inviteId,
  });
  if (error) dbFail("revoke invite", error);
  await recordAudit(supabase, {
    businessId,
    userId,
    action: "team.invite_revoked",
    entityType: "business_invite",
    entityId: inviteId,
    summary: "Revoked a pending team invite",
  });
}

export async function updateTeamMemberRole(
  supabase: Db,
  userId: string,
  businessId: string,
  memberUserId: string,
  role: string,
): Promise<void> {
  await assertPermission(supabase, businessId, "roles.manage");
  const { error } = await supabase.rpc("update_team_member_role", {
    _business_id: businessId,
    _member_user_id: memberUserId,
    _role: role as never,
  });
  if (error) dbFail("update team member role", error);
  await recordAudit(supabase, {
    businessId,
    userId,
    action: "team.role_changed",
    entityType: "business_member",
    entityId: memberUserId,
    summary: `Changed a team member's role to ${role}`,
  });
}

export async function removeTeamMember(
  supabase: Db,
  userId: string,
  businessId: string,
  memberUserId: string,
): Promise<void> {
  await assertPermission(supabase, businessId, "users.remove");
  const { error } = await supabase.rpc("remove_team_member", {
    _business_id: businessId,
    _member_user_id: memberUserId,
  });
  if (error) dbFail("remove team member", error);
  await recordAudit(supabase, {
    businessId,
    userId,
    action: "team.member_removed",
    entityType: "business_member",
    entityId: memberUserId,
    summary: "Removed a team member",
  });
}

/** Public — callable by a not-yet-authenticated visitor, so it uses its own
 * anon client rather than the request-scoped authenticated one every other
 * function in this file relies on `assertRole` to provide. */
export async function getInvitePreview(token: string): Promise<InvitePreview> {
  const { data, error } = await createAnonClient().rpc("get_invite_preview", { _token: token });
  if (error) dbFail("get invite preview", error);
  const row = (data ?? [])[0] as InvitePreview | undefined;
  if (!row) return { business_name: null, role: null, valid: false, reason: "not_found" };
  return row;
}

export async function acceptInvite(supabase: Db, token: string): Promise<{ businessId: string }> {
  const { data, error } = await supabase.rpc("accept_business_invite", { _token: token });
  if (error) dbFail("accept invite", error);
  return { businessId: data as string };
}

/** Creates a name+password account for staff without an email — an internal,
 * never-emailed placeholder address satisfies Supabase Auth's schema, but
 * staff never see or type it; they sign in with businessName+name+password
 * via resolveStaffLogin below, which resolves back to this address. Uses
 * supabaseAdmin only for the auth-user creation itself — the business_members
 * insert goes through the caller's own RLS-scoped client, same as every
 * other write in this file, since the existing "bootstrap or admin add
 * member" policy already permits an owner/admin adding anyone. */
export async function createStaffAccount(
  supabase: Db,
  businessId: string,
  callerId: string,
  displayName: string,
  password: string,
  role: string,
): Promise<{ userId: string }> {
  await assertPermission(supabase, businessId, "users.invite");
  if (await isPasswordBreached(password)) {
    throw new AppError(BREACHED_PASSWORD_MESSAGE);
  }

  const email = `staff-${crypto.randomUUID()}@internal.businessos.local`;
  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: displayName },
  });
  if (createError || !created.user) {
    console.error("[businessos] create staff account failed", createError);
    throw new AppError("Couldn't create that account. Please try again.");
  }

  const { error: memberError } = await supabase.from("business_members").insert({
    business_id: businessId,
    user_id: created.user.id,
    role: role as never,
    staff_name: displayName,
    invited_by: callerId,
  });
  if (memberError) {
    await supabaseAdmin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
    if ((memberError as { code?: string }).code === "23505") {
      throw new AppError("Someone with that name already exists on this team.");
    }
    dbFail("add staff member", memberError);
  }

  await recordAudit(supabase, {
    businessId,
    userId: callerId,
    action: "team.staff_created",
    entityType: "business_member",
    entityId: created.user.id,
    summary: `Created a staff account for ${displayName} as ${role}`,
  });
  return { userId: created.user.id };
}

export async function resetStaffPassword(
  supabase: Db,
  businessId: string,
  callerId: string,
  memberUserId: string,
  newPassword: string,
): Promise<void> {
  await assertPermission(supabase, businessId, "users.manage");

  const { data: member, error: lookupError } = await supabase
    .from("business_members")
    .select("staff_name")
    .eq("business_id", businessId)
    .eq("user_id", memberUserId)
    .eq("is_active", true)
    .maybeSingle();
  if (lookupError) dbFail("look up staff member", lookupError);
  if (!member?.staff_name) {
    throw new AppError(
      'That team member signs in with email — they can use "Forgot password" instead.',
    );
  }
  if (await isPasswordBreached(newPassword)) {
    throw new AppError(BREACHED_PASSWORD_MESSAGE);
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(memberUserId, {
    password: newPassword,
  });
  if (updateError) {
    console.error("[businessos] reset staff password failed", updateError);
    throw new AppError("Couldn't reset that password. Please try again.");
  }

  await recordAudit(supabase, {
    businessId,
    userId: callerId,
    action: "team.staff_password_reset",
    entityType: "business_member",
    entityId: memberUserId,
    summary: `Reset a staff member's password`,
  });
}

/** Public — resolves businessName+name back to the internal email so the
 * client can hand off to the existing, unmodified signIn flow. Deliberately
 * returns null for every kind of failure (wrong business name, wrong name,
 * no staff account) — same "don't reveal which part was wrong" principle
 * signIn itself already uses for wrong-email vs. wrong-password. */
export async function resolveStaffLogin(
  businessName: string,
  name: string,
): Promise<string | null> {
  const { data, error } = await createAnonClient().rpc("resolve_staff_login", {
    _business_name: businessName,
    _staff_name: name,
  });
  if (error) {
    console.error("[businessos] resolve staff login failed", error);
    return null;
  }
  return (data as string | null) ?? null;
}

export async function setStaffPassword(
  supabase: Db,
  businessId: string,
  callerId: string,
  password: string,
): Promise<void> {
  await assertPermission(supabase, businessId, "business.settings");
  if (await isPasswordBreached(password)) {
    throw new AppError(BREACHED_PASSWORD_MESSAGE);
  }
  const { error } = await supabase.rpc("set_staff_password", {
    _business_id: businessId,
    _password: password,
  });
  if (error) dbFail("set shop password", error);
  await recordAudit(supabase, {
    businessId,
    userId: callerId,
    action: "team.shop_password_set",
    entityType: "business",
    entityId: businessId,
    summary: "Set the shop sign-in password",
  });
}

export type ShopLoginResult = { valid: boolean; businessName: string | null; staffNames: string[] };

/** Public — the first of two steps for staff sign-in. Deliberately a single
 * RPC that checks the password AND returns the roster together (see
 * verify_shop_login's own comment) so the staff name list can never be
 * fetched without a valid password. */
export async function verifyShopLogin(
  businessName: string,
  password: string,
): Promise<ShopLoginResult> {
  const { data, error } = await createAnonClient().rpc("verify_shop_login", {
    _business_name: businessName,
    _password: password,
  });
  if (error) {
    console.error("[businessos] verify shop login failed", error);
    return { valid: false, businessName: null, staffNames: [] };
  }
  const row = (data ?? [])[0] as
    { valid: boolean; business_name: string | null; staff_names: string[] | null } | undefined;
  if (!row) return { valid: false, businessName: null, staffNames: [] };
  return { valid: row.valid, businessName: row.business_name, staffNames: row.staff_names ?? [] };
}

export type PermissionCatalogEntry = { key: string; category: string; label: string };
export type RolePermissionGrant = { role: string; permission_key: string };

export async function listPermissionCatalog(supabase: Db): Promise<PermissionCatalogEntry[]> {
  const { data, error } = await supabase
    .from("permissions")
    .select("key, category, label")
    .order("category")
    .order("label");
  if (error) dbFail("list permission catalog", error);
  return data ?? [];
}

export async function getRolePermissions(
  supabase: Db,
  businessId: string,
): Promise<RolePermissionGrant[]> {
  await assertPermission(supabase, businessId, "users.view");
  const { data, error } = await supabase.rpc("get_or_create_role_permissions", {
    _business_id: businessId,
  });
  if (error) dbFail("get role permissions", error);
  return data ?? [];
}

export async function setRolePermission(
  supabase: Db,
  businessId: string,
  callerId: string,
  role: string,
  permissionKey: string,
  granted: boolean,
): Promise<void> {
  await assertPermission(supabase, businessId, "roles.manage");
  const { error } = await supabase.rpc("set_role_permission", {
    _business_id: businessId,
    _role: role as never,
    _permission_key: permissionKey,
    _granted: granted,
  });
  if (error) dbFail("set role permission", error);
  await recordAudit(supabase, {
    businessId,
    userId: callerId,
    action: "team.permission_changed",
    entityType: "business_role_permissions",
    summary: `${granted ? "Granted" : "Revoked"} ${permissionKey} for ${role}`,
  });
}

export type CommissionRow = {
  user_id: string;
  display_name: string;
  commission_rate: number;
  sales_count: number;
  sales_total: number;
  commission_earned: number;
};

export async function getCommissionReport(
  supabase: Db,
  businessId: string,
  days: number,
): Promise<CommissionRow[]> {
  await assertPermission(supabase, businessId, "roles.manage");
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  const { data, error } = await supabase.rpc("get_commission_report", {
    _business_id: businessId,
    _start_date: start.toISOString().slice(0, 10),
    _end_date: end.toISOString().slice(0, 10),
  });
  if (error) dbFail("load commission report", error);
  return (data ?? []).map((row) => ({
    ...row,
    commission_rate: Number(row.commission_rate),
    sales_total: Number(row.sales_total),
    commission_earned: Number(row.commission_earned),
  }));
}

/** set_member_commission_rate already audit-logs itself (see the
 * migration) — no recordAudit call here, matching every other RPC in this
 * session that owns its own audit entry rather than duplicating it in JS. */
export async function setMemberCommissionRate(
  supabase: Db,
  businessId: string,
  memberUserId: string,
  rate: number,
): Promise<void> {
  await assertPermission(supabase, businessId, "roles.manage");
  const { error } = await supabase.rpc("set_member_commission_rate", {
    _business_id: businessId,
    _member_user_id: memberUserId,
    _rate: rate,
  });
  if (error) dbFail("set commission rate", error);
}
