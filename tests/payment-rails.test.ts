import { describe, expect, it } from "vitest";
import {
  paymentRailLabel,
  railToPaymentMethod,
  defaultRailForMethod,
  isPosPaymentRail,
  tendersAllocated,
  tendersLabel,
  tendersNeedCashDrawer,
  tendersNeedCustomer,
} from "../src/lib/payment-rails";
import { saleTenderSchema } from "../src/lib/business.schemas";

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

  it("treats a cash+EcoCash split as needing a drawer but not as all-credit", () => {
    const tenders = [
      { rail: "cash", amount: 4 },
      { rail: "ecocash", amount: 6 },
    ];
    expect(tendersNeedCashDrawer(tenders)).toBe(true);
    expect(tendersNeedCustomer(tenders)).toBe(false);
    expect(tendersAllocated(tenders)).toBe(10);
    expect(tendersLabel(tenders)).toBe("Cash + EcoCash");
  });

  it("accepts a cash tender recorded in ZiG", () => {
    const tender = saleTenderSchema.parse({
      rail: "cash",
      amount: 12.5,
      currency: "ZWG",
      amountOriginal: 1250,
    });

    expect(tender.currency).toBe("ZWG");
    expect(railToPaymentMethod(tender.rail)).toBe("cash");
  });
});
