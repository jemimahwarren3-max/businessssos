import { describe, expect, it } from "vitest";
import {
  buildLaunchSteps,
  deriveStoreLaunchDisplay,
  storeBuilderTabFromHash,
} from "@/lib/storefront/launch-status";

const emptyChecklist = {
  name: false,
  template: false,
  products: false,
  payments: false,
  fulfilment: false,
  policies: false,
  previewed: false,
  published: false,
};

describe("deriveStoreLaunchDisplay", () => {
  it("marks published shops as live", () => {
    const result = deriveStoreLaunchDisplay({
      checklist: { ...emptyChecklist, published: true },
      storeStatus: "published",
      billingEnabled: true,
      isOperateLocked: false,
    });
    expect(result.phase).toBe("live");
    expect(result.badge).toBe("Live");
  });

  it("requires payment before launch when billing is on and operate is locked", () => {
    const ready = {
      name: true,
      template: true,
      products: true,
      payments: true,
      fulfilment: true,
      policies: true,
      previewed: true,
      published: false,
    };
    const result = deriveStoreLaunchDisplay({
      checklist: ready,
      storeStatus: "draft",
      billingEnabled: true,
      isOperateLocked: true,
    });
    expect(result.phase).toBe("payment_required");
  });
});

describe("buildLaunchSteps", () => {
  it("sends dashboard launch steps to /storefront hashes, not same-page anchors", () => {
    const steps = buildLaunchSteps(emptyChecklist, { notificationsConfigured: false });
    expect(steps.map((step) => step.to)).toEqual([
      "/storefront",
      "/storefront",
      "/storefront",
      "/storefront",
      "/storefront",
      "/notifications",
      "/storefront",
    ]);
    expect(steps.find((step) => step.id === "launch")?.hash).toBe("launch-publish");
    expect(steps.find((step) => step.id === "design")?.hash).toBe("launch-design");
    expect(steps.find((step) => step.id === "notifications")?.hash).toBeUndefined();
  });
});

describe("storeBuilderTabFromHash", () => {
  it("opens the builder tab that owns the launch hash", () => {
    expect(storeBuilderTabFromHash("#launch-design")).toBe("design");
    expect(storeBuilderTabFromHash("launch-products")).toBe("products");
    expect(storeBuilderTabFromHash("#launch-payments")).toBe("info");
    expect(storeBuilderTabFromHash("#launch-fulfilment")).toBe("info");
    expect(storeBuilderTabFromHash("#store-builder")).toBe("branding");
    expect(storeBuilderTabFromHash("#launch-publish")).toBeNull();
  });
});
