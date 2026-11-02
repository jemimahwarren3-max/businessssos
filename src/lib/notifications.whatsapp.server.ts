import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";
import { toWhatsAppAddress } from "@/lib/whatsapp";
import {
  buildWhatsAppTemplatePayload,
  graphWhatsAppMessagesUrl,
  readWhatsAppCloudConfig,
} from "@/lib/notifications/whatsapp-cloud";

type RpcClient = { rpc: (...args: never[]) => unknown };

const outboxItemSchema = z.object({
  id: z.string().uuid(),
  channel: z.string().optional(),
  toPhone: z.string().nullable().optional(),
  toEmail: z.string().nullable().optional(),
  subject: z.string(),
  body: z.string(),
  attempts: z.coerce.number(),
  emailTemplate: z.string().nullable().optional(),
  orderId: z.string().uuid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type FlushWhatsAppResult = {
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
    console.error("[businessos] invalid WhatsApp outbox payload", parsed.error.flatten());
    throw new Error("The notification outbox returned an invalid payload.");
  }
  return parsed.data;
}

export function isWhatsAppCloudConfigured(): boolean {
  return readWhatsAppCloudConfig(process.env).configured;
}

export function whatsappCloudStatus(): { configured: boolean; reason: string } {
  const config = readWhatsAppCloudConfig(process.env);
  if (config.configured) {
    return {
      configured: true,
      reason: "WhatsApp Cloud credentials are set. Send still requires Meta-approved templates.",
    };
  }
  return { configured: false, reason: config.reason };
}

async function complete(
  client: RpcClient,
  id: string,
  status: "sent" | "failed" | "skipped",
  error?: string,
  providerMessageId?: string | null,
) {
  const result = await untypedRpc(client, "complete_notification_outbox", {
    _id: id,
    _status: status,
    _error: error ?? "",
    _provider_message_id: providerMessageId ?? "",
  });
  if (result.error) {
    console.error("[businessos] complete WhatsApp delivery", result.error);
    throw new Error("Could not update notification delivery status.");
  }
}

async function sendGraph(
  item: OutboxItem,
  config: { token: string; phoneNumberId: string },
): Promise<string> {
  const to = toWhatsAppAddress(item.toPhone);
  if (!to) {
    throw new Error("This WhatsApp row has no usable phone number.");
  }
  const payload = buildWhatsAppTemplatePayload({
    to,
    templateKey: item.emailTemplate ?? "customer.order.status",
    body: item.body,
  });
  const response = await fetch(graphWhatsAppMessagesUrl(config.phoneNumberId), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const json = (await response.json().catch(() => null)) as {
    messages?: { id?: string }[];
    error?: { message?: string };
  } | null;
  if (!response.ok) {
    throw new Error(
      `WhatsApp Cloud ${response.status}${json?.error?.message ? `: ${json.error.message.slice(0, 200)}` : ""}`,
    );
  }
  const providerId = json?.messages?.[0]?.id?.trim() ?? "";
  if (!providerId) {
    throw new Error("WhatsApp Cloud returned no message id. The row stays unsent.");
  }
  return providerId;
}

async function dispatch(
  items: OutboxItem[],
): Promise<{ sent: number; skipped: number; failed: number }> {
  const config = readWhatsAppCloudConfig(process.env);
  if (!config.configured) {
    return { sent: 0, skipped: 0, failed: 0 };
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const client = supabaseAdmin as RpcClient;
  let sent = 0;
  let failed = 0;
  for (const item of items) {
    if (item.channel && item.channel !== "whatsapp") continue;
    try {
      const providerId = await sendGraph(item, config);
      await complete(client, item.id, "sent", undefined, providerId);
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "WhatsApp send failed.";
      console.error("[businessos] notification WhatsApp", message);
      try {
        await complete(client, item.id, "failed", message);
      } catch (completionError) {
        console.error("[businessos] record WhatsApp failure", completionError);
      }
      failed += 1;
    }
  }
  return { sent, skipped: 0, failed };
}

export async function flushWhatsAppOutboxAdmin(): Promise<FlushWhatsAppResult> {
  const config = readWhatsAppCloudConfig(process.env);
  if (!config.configured) {
    return { sent: 0, skipped: 0, failed: 0, configured: false, reason: config.reason };
  }
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await untypedRpc(supabaseAdmin, "claim_notification_outbox_admin", {
      _limit: 25,
      _channel: "whatsapp",
    });
    if (result.error) {
      console.error("[businessos] admin WhatsApp claim", result.error);
      return {
        sent: 0,
        skipped: 0,
        failed: 1,
        configured: true,
        reason: "Could not claim queued WhatsApp messages.",
      };
    }
    const counts = await dispatch(parseItems(result.data));
    return { ...counts, configured: true };
  } catch (error) {
    console.error("[businessos] WhatsApp flush", error);
    return {
      sent: 0,
      skipped: 0,
      failed: 1,
      configured: true,
      reason: "Could not process queued WhatsApp messages.",
    };
  }
}
