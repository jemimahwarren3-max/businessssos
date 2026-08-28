import { assertMember, dbFail, type Db } from "./business.server";

export type ActiveShift = {
  id: string;
  clock_in: string;
  note: string | null;
};

export type TimeEntryRow = {
  id: string;
  user_id: string;
  display_name: string;
  clock_in: string;
  clock_out: string | null;
  note: string | null;
};

/** No assertPermission gate on the personal clock in/out/status functions —
 * any active member can clock themselves in and out (same trust level as
 * recording a sale), enforced by clock_in/clock_out's own auth.uid()-scoped
 * logic, not a role check. Only the cross-team timesheet view below is
 * owner/admin-gated. */
export async function getMyActiveShift(
  supabase: Db,
  businessId: string,
  userId: string,
): Promise<ActiveShift | null> {
  await assertMember(supabase, businessId);
  const { data, error } = await supabase
    .from("time_entries")
    .select("id, clock_in, note")
    .eq("business_id", businessId)
    .eq("user_id", userId)
    .is("clock_out", null)
    .maybeSingle();
  if (error) dbFail("load active shift", error);
  return data;
}

export async function clockIn(
  supabase: Db,
  businessId: string,
  note: string,
): Promise<{ id: string }> {
  const { data, error } = await supabase.rpc("clock_in", {
    _business_id: businessId,
    _note: (note || null) as never,
  });
  if (error) dbFail("clock in", error);
  return { id: data as string };
}

export async function clockOut(supabase: Db, businessId: string): Promise<void> {
  const { error } = await supabase.rpc("clock_out", { _business_id: businessId });
  if (error) dbFail("clock out", error);
}

export async function getMyRecentShifts(
  supabase: Db,
  businessId: string,
  userId: string,
): Promise<{ id: string; clock_in: string; clock_out: string | null; note: string | null }[]> {
  await assertMember(supabase, businessId);
  const { data, error } = await supabase
    .from("time_entries")
    .select("id, clock_in, clock_out, note")
    .eq("business_id", businessId)
    .eq("user_id", userId)
    .order("clock_in", { ascending: false })
    .limit(30);
  if (error) dbFail("load recent shifts", error);
  return data ?? [];
}

export async function listTimeEntries(
  supabase: Db,
  businessId: string,
  days: number,
): Promise<TimeEntryRow[]> {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  const { data, error } = await supabase.rpc("list_time_entries", {
    _business_id: businessId,
    _start_date: start.toISOString().slice(0, 10),
    _end_date: end.toISOString().slice(0, 10),
  });
  if (error) dbFail("load timesheets", error);
  return data ?? [];
}

export async function adjustTimeEntry(
  supabase: Db,
  businessId: string,
  entryId: string,
  clockInAt: string,
  clockOutAt: string,
): Promise<void> {
  const { error } = await supabase.rpc("adjust_time_entry", {
    _business_id: businessId,
    _entry_id: entryId,
    _clock_in: clockInAt,
    _clock_out: clockOutAt,
  });
  if (error) dbFail("adjust time entry", error);
}

export async function deleteTimeEntry(
  supabase: Db,
  businessId: string,
  entryId: string,
): Promise<void> {
  const { error } = await supabase.rpc("delete_time_entry", {
    _business_id: businessId,
    _entry_id: entryId,
  });
  if (error) dbFail("delete time entry", error);
}
