import { describe, expect, it } from "vitest";
import { fulfilmentHowLabel, paymentHowLabel } from "@/lib/storefront/receipt";
import { openPaynowSecrets, sealPaynowSecrets } from "@/lib/payments/paynow-seal";

describe("shared receipt copy", () => {
  it("says what was paid and how, without mixing cash and Paynow", () => {
    expect(paymentHowLabel("paynow", true)).toMatch(/Paynow/);
    expect(paymentHowLabel("paynow", false)).toMatch(/waiting/);
    expect(paymentHowLabel("pay_on_pickup", false)).toMatch(/collection/);
    expect(fulfilmentHowLabel("delivery")).toBe("Local delivery");
  });
});

describe("shop Paynow seal", () => {
  it("round-trips merchant keys without using platform env names", () => {
    const previous = process.env["SESSION_SECRET"];
    process.env["SESSION_SECRET"] = "test-session-secret-ok";
    const sealed = sealPaynowSecrets({
      integrationId: "shop-int",
      integrationKey: "shop-key-value",
    });
    expect(sealed).not.toContain("shop-key-value");
    expect(openPaynowSecrets(sealed)).toEqual({
      integrationId: "shop-int",
      integrationKey: "shop-key-value",
    });
    process.env["SESSION_SECRET"] = previous;
  });
});
