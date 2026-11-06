import { dbFail, recordAudit, type Db } from "@/lib/business.server";

export type PlatformAccessRequest = {
  id: string;
  reason: string;
  status: "pending" | "approved" | "declined" | "ended" | "expired";
  requestedAt: string;
  decidedAt: string | null;
  expiresAt: string | null;
};

const SAFE_MESSAGE = /owner or admin|no longer pending|not found/i;

function rpcFail(context: string, error: { message?: string }): never {
  if (SAFE_MESSAGE.test(error.message ?? "")) throw new Error(error.message);
  dbFail(context, error);
}

export async function listPlatformAccessRequests(
  supabase: Db,
  businessId: string,
): Promise<PlatformAccessRequest[]> {
  const { data, error } = await supabase.rpc(
    "business_list_access_requests" as never,
    { _business_id: businessId } as never,
  );
  if (error) rpcFail("list support access requests", error);
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row["id"]),
    reason: String(row["reason"] ?? ""),
    status: row["status"] as PlatformAccessRequest["status"],
    requestedAt: String(row["requested_at"]),
    decidedAt: row["decided_at"] ? String(row["decided_at"]) : null,
    expiresAt: row["expires_at"] ? String(row["expires_at"]) : null,
  }));
}

export async function decidePlatformAccessRequest(
  supabase: Db,
  userId: string,
  input: { businessId: string; requestId: string; approve: boolean; hours: number },
) {
  const { error } = await supabase.rpc(
    "business_decide_access_request" as never,
    {
      _request_id: input.requestId,
      _approve: input.approve,
      _hours: input.hours,
    } as never,
  );
  if (error) rpcFail("decide support access", error);
  await recordAudit(supabase, {
    businessId: input.businessId,
    userId,
    action: input.approve ? "platform_access.approved" : "platform_access.declined",
    entityType: "platform_access",
    summary: input.approve
      ? `Approved Kwetuu support access for ${input.hours} hour${input.hours === 1 ? "" : "s"}`
      : "Declined a Kwetuu support access request",
    newValues: { requestId: input.requestId },
  });
}

export async function endPlatformAccess(supabase: Db, userId: string, businessId: string) {
  const { data, error } = await supabase.rpc(
    "business_end_platform_access" as never,
    { _business_id: businessId } as never,
  );
  if (error) rpcFail("end support access", error);
  await recordAudit(supabase, {
    businessId,
    userId,
    action: "platform_access.ended",
    entityType: "platform_access",
    summary: "Ended Kwetuu support access",
    newValues: { endedCount: data ?? 0 },
  });
  return { ended: Number(data ?? 0) };
}
