import { describe, expect, it } from "vitest";
import { deriveStoreLaunchDisplay } from "@/lib/storefront/launch-status";

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
