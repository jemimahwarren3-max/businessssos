/** Pure helpers for merchant alert email. No secrets, safe to unit test. */

export type NotificationMailConfig =
  { configured: true; from: string } | { configured: false; reason: string };

export function readNotificationMailConfig(
  env: Record<string, string | undefined>,
): NotificationMailConfig {
  const apiKey = env["RESEND_API_KEY"]?.trim() ?? "";
  const from = env["NOTIFY_FROM_EMAIL"]?.trim() ?? "";
  if (!apiKey && !from) {
    return {
      configured: false,
      reason: "Email copies are off. Set RESEND_API_KEY and NOTIFY_FROM_EMAIL to send shop alerts.",
    };
  }
  if (!apiKey || !from) {
    return {
      configured: false,
      reason: "Email copies are off. Both RESEND_API_KEY and NOTIFY_FROM_EMAIL must be set.",
    };
  }
  if (!from.includes("@")) {
    return {
      configured: false,
      reason: "NOTIFY_FROM_EMAIL is not a usable From address.",
    };
  }
  return { configured: true, from };
}

export function buildResendEmail(input: {
  from: string;
  to: string;
  subject: string;
  body: string;
}) {
  return {
    from: input.from,
    to: [input.to],
    subject: input.subject,
    text: input.body,
  };
}
