import { describe, expect, it } from "vitest";
import { launchEligibilityHeadline } from "@/lib/storefront/launch-eligibility";

describe("launch eligibility copy", () => {
  it("describes launch fee and subscription states distinctly", () => {
    expect(launchEligibilityHeadline("launch_fee_unpaid")).toMatch(/launch fee/i);
    expect(launchEligibilityHeadline("subscription_inactive")).toMatch(/subscription/i);
    expect(launchEligibilityHeadline("eligible_to_publish")).toMatch(/publish/i);
  });
});
