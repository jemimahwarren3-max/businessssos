import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fulfilmentHowLabel, paymentHowLabel } from "@/lib/storefront/receipt";
import { openPaynowSecrets, sealPaynowSecrets } from "@/lib/payments/paynow-seal";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("shared receipt copy", () => {
  it("says what was paid and how, without mixing cash and Paynow", () => {
    expect(paymentHowLabel("paynow", true)).toMatch(/Paynow/);
    expect(paymentHowLabel("paynow", false)).toMatch(/waiting/);
    expect(paymentHowLabel("pay_on_pickup", false)).toMatch(/collection/);
    expect(fulfilmentHowLabel("delivery")).toBe("Local delivery");
  });
});

describe("shop Paynow seal", () => {
  it("round-trips merchant keys with the dedicated encryption key", () => {
    vi.stubEnv("SHOP_PAYMENT_ENCRYPTION_KEY", randomBytes(32).toString("base64url"));
    const sealed = sealPaynowSecrets({
      integrationId: "shop-int",
      integrationKey: "shop-key-value",
    });
    expect(sealed).not.toContain("shop-key-value");
    expect(openPaynowSecrets(sealed)).toEqual({
      integrationId: "shop-int",
      integrationKey: "shop-key-value",
      needsReEncryption: false,
    });
  });
});
