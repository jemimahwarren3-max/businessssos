import { describe, expect, it } from "vitest";
import {
  paymentRailLabel,
  railToPaymentMethod,
  defaultRailForMethod,
  isPosPaymentRail,
} from "../src/lib/payment-rails";

describe("POS payment rails", () => {
  it("maps EcoCash and InnBucks onto mobile_money without inventing a new enum", () => {
    expect(railToPaymentMethod("ecocash")).toBe("mobile_money");
    expect(railToPaymentMethod("innbucks")).toBe("mobile_money");
    expect(railToPaymentMethod("zipit")).toBe("bank_transfer");
    expect(railToPaymentMethod("bank")).toBe("bank_transfer");
    expect(railToPaymentMethod("cash")).toBe("cash");
    expect(railToPaymentMethod("credit")).toBe("credit");
  });

  it("labels rails for cashiers without claiming a provider confirmed them", () => {
    expect(paymentRailLabel("ecocash", "mobile_money")).toBe("EcoCash");
    expect(paymentRailLabel("innbucks")).toBe("InnBucks");
    expect(paymentRailLabel("zipit")).toBe("ZIPIT");
    expect(paymentRailLabel(null, "mobile_money")).toBe("Mobile money");
    expect(paymentRailLabel(null, "cash")).toBe("Cash");
  });

  it("keeps legacy enum values readable when no rail was stored", () => {
    expect(defaultRailForMethod("bank_transfer")).toBe("bank");
    expect(defaultRailForMethod("mobile_money")).toBe("mobile_money");
    expect(isPosPaymentRail("ecocash")).toBe(true);
    expect(isPosPaymentRail("paypal")).toBe(false);
  });
});
