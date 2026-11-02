import { describe, expect, it } from "vitest";
import { resumeOnboardingShopStep } from "@/lib/onboarding-resume";

describe("resumeOnboardingShopStep", () => {
  it("starts at the template picker when the shop has no slug yet", () => {
    expect(resumeOnboardingShopStep({ slug: null, productCount: 0 })).toBe(0);
  });

  it("resumes at first product when a draft storefront exists without products", () => {
    expect(resumeOnboardingShopStep({ slug: "grande", status: "draft", productCount: 0 })).toBe(1);
  });

  it("resumes at publish when inventory already has items", () => {
    expect(resumeOnboardingShopStep({ slug: "grande", status: "draft", productCount: 1 })).toBe(3);
  });
});
