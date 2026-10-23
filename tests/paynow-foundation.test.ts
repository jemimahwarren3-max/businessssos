import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { amountToMinorUnits, isPaynowPollUrl } from "../src/lib/payments/paynow-poll";
import { openPaynowSecrets, sealPaynowSecrets } from "../src/lib/payments/paynow-seal";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Paynow poll safety", () => {
  it("accepts only the HTTPS Paynow status endpoint", () => {
    expect(isPaynowPollUrl("https://www.paynow.co.zw/interface/checkpayment/?guid=abc")).toBe(true);
    expect(isPaynowPollUrl("http://www.paynow.co.zw/interface/checkpayment/?guid=abc")).toBe(false);
    expect(isPaynowPollUrl("https://attacker.example/interface/checkpayment/?guid=abc")).toBe(
      false,
    );
    expect(
      isPaynowPollUrl("https://www.paynow.co.zw.evil.example/interface/checkpayment/?guid=abc"),
    ).toBe(false);
    expect(isPaynowPollUrl("https://www.paynow.co.zw/interface/checkpayment-evil/?guid=abc")).toBe(
      false,
    );
    expect(isPaynowPollUrl("https://user@www.paynow.co.zw/interface/checkpayment/?guid=abc")).toBe(
      false,
    );
    expect(isPaynowPollUrl("https://www.paynow.co.zw/redirect?to=internal")).toBe(false);
  });

  it("compares provider amounts as integer minor units", () => {
    expect(amountToMinorUnits("0.01")).toBe(1n);
    expect(amountToMinorUnits("12")).toBe(1200n);
    expect(amountToMinorUnits("12.3")).toBe(1230n);
    expect(amountToMinorUnits("12.30")).toBe(1230n);
    expect(amountToMinorUnits("12.301")).toBeNull();
    expect(amountToMinorUnits("-1.00")).toBeNull();
    expect(amountToMinorUnits("1000000000000.00")).toBeNull();
  });
});

describe("shop Paynow credential encryption", () => {
  it("seals credentials with authenticated encryption and marks current-key ciphertext", () => {
    vi.stubEnv("SHOP_PAYMENT_ENCRYPTION_KEY", randomBytes(32).toString("base64url"));
    const ciphertext = sealPaynowSecrets({
      integrationId: "integration-123",
      integrationKey: "private-integration-key",
    });

    expect(ciphertext.startsWith("v1.")).toBe(true);
    expect(ciphertext).not.toContain("private-integration-key");
    expect(openPaynowSecrets(ciphertext)).toEqual({
      integrationId: "integration-123",
      integrationKey: "private-integration-key",
      needsReEncryption: false,
    });
    expect(() => openPaynowSecrets(`${ciphertext.slice(0, -2)}aa`)).toThrow();
  });

  it("reads previous-key ciphertext so it can be re-encrypted on access", () => {
    const previousKey = randomBytes(32).toString("base64url");
    vi.stubEnv("SHOP_PAYMENT_ENCRYPTION_KEY", previousKey);
    const ciphertext = sealPaynowSecrets({
      integrationId: "integration-123",
      integrationKey: "private-integration-key",
    });

    vi.stubEnv("SHOP_PAYMENT_ENCRYPTION_KEY", randomBytes(32).toString("base64url"));
    vi.stubEnv("SHOP_PAYMENT_ENCRYPTION_KEY_PREVIOUS", previousKey);
    expect(openPaynowSecrets(ciphertext).needsReEncryption).toBe(true);
  });

  it("reads legacy session-secret ciphertext for backward compatibility", () => {
    const sessionSecret = "legacy-session-secret-that-is-long-enough";
    const iv = randomBytes(12);
    const key = createHash("sha256").update(`store-paynow:${sessionSecret}`).digest();
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([
      cipher.update(
        JSON.stringify({
          integrationId: "legacy-id",
          integrationKey: "legacy-secret",
        }),
        "utf8",
      ),
      cipher.final(),
    ]);
    const ciphertext = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
    vi.stubEnv("SESSION_SECRET", sessionSecret);
    vi.stubEnv("SHOP_PAYMENT_ENCRYPTION_KEY", randomBytes(32).toString("base64url"));

    expect(openPaynowSecrets(ciphertext)).toEqual({
      integrationId: "legacy-id",
      integrationKey: "legacy-secret",
      needsReEncryption: true,
    });
  });
});
