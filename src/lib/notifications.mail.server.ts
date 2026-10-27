import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";
import {
  buildResendEmail,
  buildResendHeaders,
  readNotificationMailConfig,
} from "./notifications.mail";

type RpcClient = { rpc: (...args: never[]) => unknown };

const outboxItemSchema = z.object({
  id: z.string().uuid(),
  toEmail: z.string().min(3),
  subject: z.string(),
  body: z.string(),
  attempts: z.coerce.number(),
  notificationId: z.string().uuid().nullable().optional(),
});

export type FlushMailResult = {
  sent: number;
  skipped: number;
  failed: number;
  configured: boolean;
  reason?: string;
};

type OutboxItem = z.infer<typeof outboxItemSchema>;

async function untypedRpc(
  client: RpcClient,
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

function parseItems(data: Json | null): OutboxItem[] {
  const parsed = z.array(outboxItemSchema).safeParse(data);
  if (!parsed.success) {
    console.error("[businessos] invalid notification outbox payload", parsed.error.flatten());
    throw new Error("The notification outbox returned an invalid payload.");
  }
  return parsed.data;
}

export function isNotificationEmailConfigured(): boolean {
  return readNotificationMailConfig(process.env).configured;
}

export function notificationEmailStatus(): { configured: boolean; reason: string } {
  const config = readNotificationMailConfig(process.env);
  if (config.configured) {
    return {
      configured: true,
      reason: "Shop alerts and shopper order emails can be sent through Resend.",
    };
  }
  return { configured: false, reason: config.reason };
}

async function sendResend(item: OutboxItem, from: string, apiKey: string): Promise<void> {
  const payload = buildResendEmail({
    from,
    to: item.toEmail,
    subject: item.subject,
    body: item.body,
  });
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: buildResendHeaders(apiKey, item.id),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Resend ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
}

async function complete(
  client: RpcClient,
  id: string,
  status: "sent" | "failed" | "skipped",
  error?: string,
) {
  const result = await untypedRpc(client, "complete_notification_outbox", {
    _id: id,
    _status: status,
    _error: error ?? "",
  });
  if (result.error) {
    console.error("[businessos] complete notification delivery", result.error);
    throw new Error("Could not update notification delivery status.");
  }
}

async function dispatch(
  client: RpcClient,
  items: OutboxItem[],
): Promise<{ sent: number; skipped: number; failed: number }> {
  const config = readNotificationMailConfig(process.env);
  let sent = 0;
  const skipped = 0;
  let failed = 0;
  if (!config.configured) {
    return { sent: 0, skipped: 0, failed: 0 };
  }
  for (const item of items) {
    try {
      const apiKey = process.env["RESEND_API_KEY"]?.trim() ?? "";
      await sendResend(item, config.from, apiKey);
      await complete(client, item.id, "sent");
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Email send failed.";
      console.error("[businessos] notification email", message);
      try {
        await complete(client, item.id, "failed", message);
      } catch (completionError) {
        console.error("[businessos] record notification email failure", completionError);
      }
      failed += 1;
    }
  }
  return { sent, skipped, failed };
}

export async function flushNotificationOutboxForBusiness(
  supabase: RpcClient,
  businessId: string,
): Promise<FlushMailResult> {
  const config = readNotificationMailConfig(process.env);
  if (!config.configured) {
    return { sent: 0, skipped: 0, failed: 0, configured: false, reason: config.reason };
  }
  try {
    const result = await untypedRpc(supabase, "claim_notification_outbox", {
      _business_id: businessId,
      _limit: 15,
    });
    if (result.error) {
      console.error("[businessos] claim notification outbox", result.error);
      const migrationMissing =
        result.error.message?.includes("schema cache") ||
        result.error.message?.includes("Could not find");
      return {
        sent: 0,
        skipped: 0,
        failed: 1,
        configured: true,
        reason: migrationMissing
          ? "The notification outbox migration is missing from this database."
          : "Could not claim queued notification emails.",
      };
    }
    const counts = await dispatch(supabase, parseItems(result.data));
    return { ...counts, configured: true };
  } catch (error) {
    console.error("[businessos] notification flush", error);
    return {
      sent: 0,
      skipped: 0,
      failed: 1,
      configured: true,
      reason: "Could not process queued notification emails.",
    };
  }
}

export async function flushNotificationOutboxAdmin(): Promise<FlushMailResult> {
  const config = readNotificationMailConfig(process.env);
  if (!config.configured) {
    return { sent: 0, skipped: 0, failed: 0, configured: false, reason: config.reason };
  }
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await untypedRpc(supabaseAdmin, "claim_notification_outbox_admin", {
      _limit: 25,
    });
    if (result.error) {
      console.error("[businessos] admin notification claim", result.error);
      const migrationMissing =
        result.error.message?.includes("schema cache") ||
        result.error.message?.includes("Could not find");
      return {
        sent: 0,
        skipped: 0,
        failed: 1,
        configured: true,
        reason: migrationMissing
          ? "The notification outbox migration is missing from this database."
          : "Could not claim queued notification emails.",
      };
    }
    const counts = await dispatch(supabaseAdmin, parseItems(result.data));
    return { ...counts, configured: true };
  } catch (error) {
    console.error("[businessos] admin notification flush skipped", error);
    return {
      sent: 0,
      skipped: 0,
      failed: 1,
      configured: true,
      reason: "Could not process queued notification emails.",
    };
  }
}
