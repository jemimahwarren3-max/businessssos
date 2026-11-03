import { describe, expect, it } from "vitest";
import { evaluateFlushMailCron } from "@/lib/notifications.flush-summary";

describe("evaluateFlushMailCron", () => {
  it("treats both channels unconfigured as a successful no-op", () => {
    const result = evaluateFlushMailCron({
      email: {
        sent: 0,
        failed: 0,
        skipped: 0,
        configured: false,
        reason: "Email is queued until RESEND_API_KEY is set.",
      },
      whatsapp: {
        sent: 0,
        failed: 0,
        skipped: 0,
        configured: false,
        reason: "WhatsApp Cloud is not configured.",
      },
    });
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.summary).toContain("sent=0");
  });

  it("fails when a configured channel reports failed deliveries", () => {
    const result = evaluateFlushMailCron({
      email: { sent: 1, failed: 2, skipped: 0, configured: true, reason: "Resend 429" },
      whatsapp: { sent: 0, failed: 0, skipped: 0, configured: false },
    });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.summary).toContain("failed=2");
  });

  it("succeeds when mail sent and WhatsApp is unconfigured", () => {
    const result = evaluateFlushMailCron({
      email: { sent: 3, failed: 0, skipped: 1, configured: true },
      whatsapp: { sent: 0, failed: 0, skipped: 0, configured: false },
    });
    expect(result.ok).toBe(true);
    expect(result.summary).toContain("sent=3");
  });
});
