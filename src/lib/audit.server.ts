import { assertPermission, dbFail, type Db } from "./business.server";

export type AuditLogEntry = {
  id: string;
  created_at: string;
  actor_name: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string | null;
  result: string;
};

const PAGE_SIZE = 50;

/** RLS on audit_logs stays on the coarse owner/admin role check (see the
 * migration) — this is the fine-grained, customizable-per-business gate on
 * top, same split as every other permission in this file's siblings. */
export async function listAuditLogs(
  supabase: Db,
  businessId: string,
  offset: number,
): Promise<{ entries: AuditLogEntry[]; hasMore: boolean }> {
  await assertPermission(supabase, businessId, "audit.view");
  const { data, error } = await supabase.rpc("list_audit_logs", {
    _business_id: businessId,
    _limit: PAGE_SIZE,
    _offset: offset,
  });
  if (error) dbFail("list audit logs", error);
  const rows = (data ?? []) as AuditLogEntry[];
  const hasMore = rows.length > PAGE_SIZE;
  return { entries: hasMore ? rows.slice(0, PAGE_SIZE) : rows, hasMore };
}
