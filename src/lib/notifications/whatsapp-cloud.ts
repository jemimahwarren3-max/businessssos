/** Pure helpers for WhatsApp Cloud. No secrets, safe to unit test.
 * Nothing is marked sent from these helpers. */

export type WhatsAppCloudConfig =
  | { configured: true; token: string; phoneNumberId: string }
  | { configured: false; reason: string };

export const WHATSAPP_TEMPLATE_NAMES = {
  "customer.order.placed": "kwetuu_order_placed",
  "customer.order.status": "kwetuu_order_status",
  "customer.payment.updated": "kwetuu_order_payment",
  "marketing.broadcast": "kwetuu_marketing",
} as const;

export type WhatsAppTemplateKey = keyof typeof WHATSAPP_TEMPLATE_NAMES;

export function readWhatsAppCloudConfig(
  env: Record<string, string | undefined>,
): WhatsAppCloudConfig {
  const token = env["WHATSAPP_CLOUD_TOKEN"]?.trim() ?? "";
  const phoneNumberId = env["WHATSAPP_CLOUD_PHONE_NUMBER_ID"]?.trim() ?? "";
  if (!token && !phoneNumberId) {
    return {
      configured: false,
      reason:
        "WhatsApp is queued until WHATSAPP_CLOUD_TOKEN and WHATSAPP_CLOUD_PHONE_NUMBER_ID are set. Messages are not discarded and are not marked sent.",
    };
  }
  if (!token || !phoneNumberId) {
    return {
      configured: false,
      reason:
        "WhatsApp is queued until both WHATSAPP_CLOUD_TOKEN and WHATSAPP_CLOUD_PHONE_NUMBER_ID are set. Messages are not discarded.",
    };
  }
  return { configured: true, token, phoneNumberId };
}

export function graphWhatsAppMessagesUrl(phoneNumberId: string): string {
  return `https://graph.facebook.com/v21.0/${encodeURIComponent(phoneNumberId)}/messages`;
}

export function buildWhatsAppTemplatePayload(input: {
  to: string;
  templateKey: string;
  body: string;
}) {
  const name =
    input.templateKey in WHATSAPP_TEMPLATE_NAMES
      ? WHATSAPP_TEMPLATE_NAMES[input.templateKey as WhatsAppTemplateKey]
      : WHATSAPP_TEMPLATE_NAMES["customer.order.status"];
  return {
    messaging_product: "whatsapp" as const,
    to: input.to,
    type: "template" as const,
    template: {
      name,
      language: { code: "en" },
      components: [
        {
          type: "body",
          parameters: [{ type: "text", text: input.body.slice(0, 1024) }],
        },
      ],
    },
  };
}
