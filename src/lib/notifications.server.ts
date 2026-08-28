import { dbFail, type Db } from "./business.server";

export type NotificationEntry = {
  id: string;
  type: string;
  title: string;
  message: string | null;
  severity: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

const PAGE_SIZE = 20;

/** No assertPermission gate — unlike audit logs, notifications aren't
 * owner/admin-only, they're personal-or-business-wide alerts every member
 * should see. RLS (see 20260807043649_...sql's "members read own
 * notifications"/"members update own notifications" policies) is the whole
 * enforcement layer here: business_id membership plus user_id being null
 * (business-wide) or the caller's own. */
export async function listNotifications(
  supabase: Db,
  businessId: string,
): Promise<{ entries: NotificationEntry[]; unreadCount: number }> {
  const [{ data, error }, { count, error: countError }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, type, title, message, severity, link, is_read, created_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("is_read", false),
  ]);
  if (error) dbFail("list notifications", error);
  if (countError) dbFail("count unread notifications", countError);
  return { entries: data ?? [], unreadCount: count ?? 0 };
}

export async function markNotificationRead(supabase: Db, notificationId: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", notificationId);
  if (error) dbFail("mark notification read", error);
}

export async function markAllNotificationsRead(supabase: Db, businessId: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("business_id", businessId)
    .eq("is_read", false);
  if (error) dbFail("mark all notifications read", error);
}
