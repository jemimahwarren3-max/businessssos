import { describe, expect, it } from "vitest";
import { growthMetricsSchema, parseMarketingDraftResponse } from "@/lib/growth.contract";

describe("growth intelligence contracts", () => {
  it("accepts valid campaign JSON and fenced JSON", () => {
    const draft = {
      name: "New arrivals",
      headline: "Explore the new collection",
      copy: "Browse the latest pieces from our shop.",
      callToAction: "View the collection",
    };
    expect(parseMarketingDraftResponse(JSON.stringify(draft))).toEqual(draft);
    expect(parseMarketingDraftResponse(`\`\`\`json\n${JSON.stringify(draft)}\n\`\`\``)).toEqual(
      draft,
    );
  });

  it("rejects incomplete or extra AI campaign fields", () => {
    expect(() => parseMarketingDraftResponse('{"name":"Only a name"}')).toThrow();
    expect(() =>
      parseMarketingDraftResponse(
        JSON.stringify({
          name: "Campaign",
          headline: "Headline",
          copy: "Post",
          callToAction: "See more",
          discount: "20%",
        }),
      ),
    ).toThrow();
  });

  it("requires non-negative metrics, bounded conversion, and currency-separated revenue", () => {
    const valid = {
      periodDays: 30,
      uniqueVisitors: 10,
      productViews: 4,
      addToCartVisitors: 2,
      checkoutVisitors: 1,
      orders: 2,
      paidOrders: 1,
      trackedPaidOrders: 1,
      trackedPaidVisitors: 1,
      conversionRate: 10,
      paidRevenueByCurrency: [
        { currency: "USD", amount: 15 },
        { currency: "ZWG", amount: 300 },
      ],
      sources: [{ source: "whatsapp", visitors: 10 }],
      products: [],
      campaigns: [],
    };
    expect(growthMetricsSchema.parse(valid).paidRevenueByCurrency).toHaveLength(2);
    expect(() => growthMetricsSchema.parse({ ...valid, conversionRate: 101 })).toThrow();
    expect(() =>
      growthMetricsSchema.parse({
        ...valid,
        paidRevenueByCurrency: [{ currency: "USD", amount: -1 }],
      }),
    ).toThrow();
  });
});
