/** Pure helpers for merchant and shopper transactional email. No secrets, safe to unit test. */

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
      reason:
        "Email is queued until RESEND_API_KEY and NOTIFY_FROM_EMAIL are set. Messages are not discarded.",
    };
  }
  if (!apiKey || !from) {
    return {
      configured: false,
      reason:
        "Email is queued until both RESEND_API_KEY and NOTIFY_FROM_EMAIL are set. Messages are not discarded.",
    };
  }
  if (!from.includes("@")) {
    return {
      configured: false,
      reason: "NOTIFY_FROM_EMAIL is not a usable From address. Queued messages stay pending.",
    };
  }
  return { configured: true, from };
}

export function authorizeMailFlush(
  authorization: string | null | undefined,
  secret: string | undefined,
): boolean {
  const expected = secret?.trim() ?? "";
  if (expected.length < 16) return false;
  const header = authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return diff === 0;
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
