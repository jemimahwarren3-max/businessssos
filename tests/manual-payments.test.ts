import { describe, expect, it } from "vitest";
import { PLAN_MONTHLY_USD } from "@/lib/billing-plans";
import { CURRENCIES } from "@/lib/business.schemas";
import { formatMoney } from "@/lib/format";
import {
  enabledManualMethods,
  mergeManualMethods,
  paymentIsUnconfirmedUntilSeller,
} from "@/lib/storefront/manual-payments";
import { paymentHowLabel } from "@/lib/storefront/receipt";

describe("listed subscription price", () => {
  it("uses one configurable USD monthly amount", () => {
    expect(PLAN_MONTHLY_USD.pro).toBe(7);
  });
});

describe("ZiG display", () => {
  it("labels ZWG amounts as ZiG without converting them", () => {
    expect(CURRENCIES).toContain("ZWG");
    expect(formatMoney(12.5, "ZWG")).toBe("ZiG 12.50");
    expect(formatMoney(12.5, "USD")).toMatch(/12\.50/);
  });
});

describe("manual payment methods", () => {
  it("hides empty instruction rows from checkout", () => {
    expect(
      enabledManualMethods([
        {
          id: "ecocash",
          kind: "ecocash",
          enabled: true,
          accountName: "Ada",
          accountDetail: "",
          instructions: "",
        },
        {
          id: "bank_transfer",
          kind: "bank_transfer",
          enabled: true,
          accountName: "Ada",
          accountDetail: "123456",
          instructions: "",
        },
      ]).map((method) => method.id),
    ).toEqual(["bank_transfer"]);
  });

  it("fills the four instruction slots from saved shop settings", () => {
    const merged = mergeManualMethods([
      {
        id: "ecocash",
        kind: "ecocash",
        enabled: true,
        accountName: "Ada",
        accountDetail: "0772000000",
        instructions: "Use the order number",
      },
    ]);
    expect(merged).toHaveLength(4);
    expect(merged[0]?.enabled).toBe(true);
    expect(merged[1]?.enabled).toBe(false);
  });

  it("does not treat a customer note as paid", () => {
    expect(paymentIsUnconfirmedUntilSeller("manual")).toBe(true);
    expect(paymentHowLabel("manual", false)).toMatch(/not a confirmed payment/i);
    expect(paymentHowLabel("manual", true)).toMatch(/checked their account/i);
  });
});
