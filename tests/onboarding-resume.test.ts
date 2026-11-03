import { describe, expect, it } from "vitest";
import {
  onboardingLoadGate,
  onboardingShopStepStorageKey,
  readOnboardingShopStep,
  resumeOnboardingShopStep,
} from "@/lib/onboarding-resume";

describe("onboardingLoadGate", () => {
  const idle = {
    workspaceLoading: false,
    workspaceError: false,
    businessId: null as string | null,
    adminLoading: false,
    hasAdminData: false,
    adminError: false,
    timedOut: false,
  };

  it("spins while the workspace is loading", () => {
    expect(onboardingLoadGate({ ...idle, workspaceLoading: true })).toBe("spinner");
  });

  it("does not leave a returning merchant on a spinner after the timeout", () => {
    expect(
      onboardingLoadGate({
        ...idle,
        workspaceLoading: true,
        timedOut: true,
      }),
    ).toBe("workspace-error");
    expect(
      onboardingLoadGate({
        ...idle,
        businessId: "biz",
        adminLoading: true,
        timedOut: true,
      }),
    ).toBe("ready");
  });

  it("shows the storefront error once that query fails", () => {
    expect(
      onboardingLoadGate({
        ...idle,
        businessId: "biz",
        adminError: true,
      }),
    ).toBe("admin-error");
  });
});

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

  it("keeps the step the merchant was on after a 404 round-trip", () => {
    expect(
      resumeOnboardingShopStep({
        slug: "grande",
        status: "draft",
        productCount: 0,
        savedStep: 3,
      }),
    ).toBe(3);
  });

  it("reads a saved shop step from session storage", () => {
    const businessId = "11111111-1111-4111-8111-111111111111";
    const storage = {
      getItem: (key: string) => (key === onboardingShopStepStorageKey(businessId) ? "3" : null),
    };
    expect(readOnboardingShopStep(storage, businessId)).toBe(3);
    expect(readOnboardingShopStep({ getItem: () => "9" }, businessId)).toBeNull();
  });
});
