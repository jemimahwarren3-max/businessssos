/** Shared shape for email + WhatsApp flush sides returned by /api/internal/flush-mail. */

export type FlushChannelResult = {
  sent: number;
  failed: number;
  skipped: number;
  configured: boolean;
  reason?: string;
};

export type FlushMailApiPayload = {
  email?: FlushChannelResult;
  whatsapp?: FlushChannelResult;
};

export type FlushCronDecision = {
  ok: boolean;
  exitCode: number;
  summary: string;
};

function side(value: FlushChannelResult | undefined): FlushChannelResult {
  return {
    sent: value?.sent ?? 0,
    failed: value?.failed ?? 0,
    skipped: value?.skipped ?? 0,
    configured: value?.configured === true,
    ...(value?.reason ? { reason: value.reason } : {}),
  };
}

/**
 * Cron must succeed when both channels are unconfigured (nothing to send).
 * Fail only when a configured channel reports failed > 0.
 */
export function evaluateFlushMailCron(payload: FlushMailApiPayload): FlushCronDecision {
  const email = side(payload.email);
  const whatsapp = side(payload.whatsapp);
  const sent = email.sent + whatsapp.sent;
  const failed = email.failed + whatsapp.failed;
  const skipped = email.skipped + whatsapp.skipped;
  const summary =
    `Mail flush: sent=${sent}, failed=${failed}, skipped=${skipped}` +
    ` (email configured=${email.configured}, whatsapp configured=${whatsapp.configured})`;
  if (failed > 0) {
    return {
      ok: false,
      exitCode: 1,
      summary: [summary, email.reason, whatsapp.reason].filter(Boolean).join(" "),
    };
  }
  return { ok: true, exitCode: 0, summary };
}
