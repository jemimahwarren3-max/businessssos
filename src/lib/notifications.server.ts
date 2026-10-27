import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";
import { dbFail, type Db } from "./business.server";
import {
  flushNotificationOutboxForBusiness,
  isNotificationEmailConfigured,
} from "./notifications.mail.server";

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

export type NotificationList = {
  entries: NotificationEntry[];
  unreadCount: number;
  emailConfigured: boolean;
};

const PAGE_SIZE = 20;

async function untypedRpc(
  client: { rpc: (...args: never[]) => unknown },
  fn: string,
  args: Record<string, unknown>,
): Promise<{ data: Json | null; error: { message?: string } | null }> {
  return (await (
    client.rpc as (
      name: string,
      params: Record<string, unknown>,
    ) => Promise<{ data: Json | null; error: { message?: string } | null }>
  )(fn, args)) as { data: Json | null; error: { message?: string } | null };
}

/** No assertPermission gate — unlike audit logs, notifications aren't
 * owner/admin-only, they're personal-or-business-wide alerts every member
 * should see. RLS (see 20260807043649_...sql's "members read own
 * notifications"/"members update own notifications" policies) is the whole
 * enforcement layer here: business_id membership plus user_id being null
 * (business-wide) or the caller's own. */
export async function listNotifications(
  supabase: Db,
  businessId: string,
  offset = 0,
): Promise<NotificationList> {
  await flushNotificationOutboxForBusiness(supabase, businessId);
  const [{ data, error }, { count, error: countError }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, type, title, message, severity, link, is_read, created_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("is_read", false),
  ]);
  if (error) dbFail("list notifications", error);
  if (countError) dbFail("count unread notifications", countError);
  return {
    entries: data ?? [],
    unreadCount: count ?? 0,
    emailConfigured: isNotificationEmailConfigured(),
  };
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

export async function getNotifyEmail(supabase: Db, businessId: string): Promise<boolean> {
  const result = await untypedRpc(supabase, "get_notify_email", { _business_id: businessId });
  if (result.error) dbFail("load email alert preference", result.error);
  const parsed = z.boolean().safeParse(result.data);
  return parsed.success ? parsed.data : true;
}

export async function setNotifyEmail(
  supabase: Db,
  businessId: string,
  enabled: boolean,
): Promise<boolean> {
  const result = await untypedRpc(supabase, "set_notify_email", {
    _business_id: businessId,
    _enabled: enabled,
  });
  if (result.error) dbFail("save email alert preference", result.error);
  const parsed = z.boolean().safeParse(result.data);
  return parsed.success ? parsed.data : enabled;
}

const orderEmailDeliverySchema = z.array(
  z.object({
    id: z.string().uuid(),
    recipientRole: z.string().nullable(),
    toEmail: z.string(),
    subject: z.string(),
    status: z.string(),
    attempts: z.coerce.number(),
    lastError: z.string(),
    emailTemplate: z.string(),
    createdAt: z.string(),
    sentAt: z.string().nullable(),
  }),
);

export async function listOrderEmailDeliveries(
  supabase: Db,
  businessId: string,
  orderId: string,
) {
  const result = await untypedRpc(supabase, "list_order_email_deliveries", {
    _business_id: businessId,
    _order_id: orderId,
  });
  if (result.error) dbFail("list order email deliveries", result.error);
  const parsed = orderEmailDeliverySchema.safeParse(result.data);
  if (!parsed.success) {
    console.error("[businessos] order email deliveries payload", parsed.error.flatten());
    return [];
  }
  return parsed.data;
}

export async function retryOrderEmailDelivery(
  supabase: Db,
  businessId: string,
  outboxId: string,
) {
  const result = await untypedRpc(supabase, "retry_order_email_delivery", {
    _business_id: businessId,
    _outbox_id: outboxId,
  });
  if (result.error) dbFail("retry order email delivery", result.error);
  await flushNotificationOutboxForBusiness(supabase, businessId);
  const parsed = orderEmailDeliverySchema.safeParse(result.data);
  if (!parsed.success) return [];
  return parsed.data;
}
