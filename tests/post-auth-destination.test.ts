import { describe, expect, it } from "vitest";
import { destinationAfterAuth } from "@/lib/auth/post-auth-destination";

describe("destinationAfterAuth", () => {
  it("sends owners and staff with a finished shop to the dashboard", () => {
    expect(destinationAfterAuth({ onboardingCompleted: true, isPlatformAdmin: false })).toBe(
      "/dashboard",
    );
  });

  it("keeps a merchant who still needs setup on onboarding", () => {
    expect(destinationAfterAuth({ onboardingCompleted: false, isPlatformAdmin: false })).toBe(
      "/onboarding",
    );
  });

  it("does not send a shop owner to /admin even if they are also a platform admin", () => {
    expect(destinationAfterAuth({ onboardingCompleted: true, isPlatformAdmin: true })).toBe(
      "/dashboard",
    );
  });

  it("sends a platform administrator with no shop to /admin", () => {
    expect(destinationAfterAuth({ onboardingCompleted: null, isPlatformAdmin: true })).toBe(
      "/admin",
    );
  });

  it("sends a signed-in user with no shop to onboarding, not a missing customer route", () => {
    expect(destinationAfterAuth({ onboardingCompleted: null, isPlatformAdmin: false })).toBe(
      "/onboarding",
    );
  });
});
