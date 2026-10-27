import { describe, expect, it } from "vitest";
import {
  authorizeMailFlush,
  buildResendEmail,
  buildResendHeaders,
  readNotificationMailConfig,
} from "@/lib/notifications.mail";

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

  it("includes HTML when provided for responsive templates", () => {
    const payload = buildResendEmail({
      from: "alerts@example.com",
      to: "shopper@example.com",
      subject: "Order ON-0001",
      body: "Plain fallback",
      html: "<p>Order</p>",
    });
    expect(payload.html).toBe("<p>Order</p>");
    expect(payload.text).toBe("Plain fallback");
  });

  it("sends a stable provider idempotency key for outbox retries", () => {
    const headers = buildResendHeaders("re_test", "2bc89462-1d20-4b8e-a59a-65c601a7182a");
    expect(headers.Authorization).toBe("Bearer re_test");
    expect(headers["Idempotency-Key"]).toBe("2bc89462-1d20-4b8e-a59a-65c601a7182a");
  });

  it("does not treat missing Resend as a discard", () => {
    const config = readNotificationMailConfig({});
    expect(config.configured).toBe(false);
    if (!config.configured) {
      expect(config.reason).toMatch(/not discarded|queued/i);
    }
  });
});

describe("mail flush bearer", () => {
  const secret = "mail-flush-secret-ok";

  it("rejects missing or short secrets", () => {
    expect(authorizeMailFlush("Bearer anything-long-enough", "")).toBe(false);
    expect(authorizeMailFlush("Bearer short", "short")).toBe(false);
    expect(authorizeMailFlush(null, secret)).toBe(false);
  });

  it("accepts only the matching Bearer token", () => {
    expect(authorizeMailFlush(`Bearer ${secret}`, secret)).toBe(true);
    expect(authorizeMailFlush(`Bearer ${secret}x`, secret)).toBe(false);
    expect(authorizeMailFlush(secret, secret)).toBe(false);
  });
});
