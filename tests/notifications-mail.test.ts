import { describe, expect, it } from "vitest";
import { buildResendEmail, readNotificationMailConfig } from "@/lib/notifications.mail";

describe("merchant alert email config", () => {
  it("stays off when no provider is configured", () => {
    const config = readNotificationMailConfig({});
    expect(config.configured).toBe(false);
    if (!config.configured) {
      expect(config.reason).toMatch(/RESEND_API_KEY/);
    }
  });

  it("stays off when only one of the two settings is present", () => {
    expect(readNotificationMailConfig({ RESEND_API_KEY: "re_test" }).configured).toBe(false);
    expect(readNotificationMailConfig({ NOTIFY_FROM_EMAIL: "alerts@example.com" }).configured).toBe(
      false,
    );
  });

  it("turns on only with a From address and an API key", () => {
    const config = readNotificationMailConfig({
      RESEND_API_KEY: "re_test",
      NOTIFY_FROM_EMAIL: "alerts@example.com",
    });
    expect(config).toEqual({ configured: true, from: "alerts@example.com" });
  });

  it("builds a plain-text Resend payload without HTML", () => {
    const payload = buildResendEmail({
      from: "alerts@example.com",
      to: "owner@shop.test",
      subject: "New online order ON-0001",
      body: "Ada · USD 12",
    });
    expect(payload.to).toEqual(["owner@shop.test"]);
    expect(payload.text).toContain("Ada");
    expect(payload).not.toHaveProperty("html");
  });
});
