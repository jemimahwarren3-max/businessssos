import { describe, expect, it } from "vitest";
import {
  createListingReportSchema,
  createReviewSchema,
  emptyProductReviews,
  productReviewsSchema,
  publicReviewSchema,
  storeReviewResponseSchema,
} from "@/lib/storefront/contract";

describe("verified purchase reviews", () => {
  it("rejects a review without an access code or a real rating", () => {
    const missingToken = createReviewSchema.safeParse({
      slug: "harare-cloth",
      reference: "ABC123",
      token: "short",
      productId: "00000000-0000-4000-8000-000000000001",
      rating: 5,
      body: "The dress matched the photo and arrived on time.",
    });
    expect(missingToken.success).toBe(false);
    const badRating = createReviewSchema.safeParse({
      slug: "harare-cloth",
      reference: "ABC123",
      token: "access-code-ok",
      productId: "00000000-0000-4000-8000-000000000001",
      rating: 9,
      body: "The dress matched the photo and arrived on time.",
    });
    expect(badRating.success).toBe(false);
  });

  it("accepts a complete verified-purchase payload", () => {
    const ok = createReviewSchema.parse({
      slug: "harare-cloth",
      reference: "ABC123",
      token: "access-code-ok",
      productId: "00000000-0000-4000-8000-000000000001",
      rating: 4,
      body: "Colour was a little lighter than the photo but still usable.",
    });
    expect(ok.rating).toBe(4);
  });

  it("does not treat an empty review list as a zero-star score", () => {
    const parsed = productReviewsSchema.parse(emptyProductReviews);
    expect(parsed.count).toBe(0);
    expect(parsed.average).toBeNull();
    expect(parsed.reviews).toEqual([]);
  });

  it("shows a shop response alongside a verified public review", () => {
    const parsed = publicReviewSchema.parse({
      id: "review-1",
      rating: 4,
      body: "The dress matched the photo and arrived on time.",
      displayName: "Tariro",
      createdAt: "2026-10-20T12:00:00Z",
      verifiedPurchase: true,
      merchantResponse: "Thanks for taking the time to share this.",
      merchantRespondedAt: "2026-10-20T13:00:00Z",
    });
    expect(parsed.merchantResponse).toContain("Thanks");
    expect(parsed.verifiedPurchase).toBe(true);
  });
});

describe("listing reports", () => {
  it("requires a reason and enough detail", () => {
    const bad = createListingReportSchema.safeParse({
      slug: "harare-cloth",
      reason: "hate",
      detail: "no",
    });

    expect(bad.success).toBe(false);
    const ok = createListingReportSchema.parse({
      slug: "harare-cloth",
      reason: "misleading",
      detail: "The listed price is not the price shown at checkout.",
    });
    expect(ok.reason).toBe("misleading");
    expect(ok.productId).toBeUndefined();
  });
});

describe("shop review responses", () => {
  it("requires a review and a short public response", () => {
    const base = {
      businessId: "00000000-0000-4000-8000-000000000001",
      reviewId: "00000000-0000-4000-8000-000000000002",
    };
    expect(storeReviewResponseSchema.safeParse({ ...base, response: " " }).success).toBe(false);
    expect(
      storeReviewResponseSchema.safeParse({ ...base, response: "x".repeat(1001) }).success,
    ).toBe(false);
    expect(storeReviewResponseSchema.parse({ ...base, response: "Thank you!" }).response).toBe(
      "Thank you!",
    );
  });
});
