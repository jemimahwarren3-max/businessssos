import { describe, expect, it } from "vitest";
import {
  applyOAuthNext,
  destinationAfterAuth,
  onboardingPageDestination,
  shouldSendToCreateShop,
} from "@/lib/auth/post-auth-destination";

describe("destinationAfterAuth", () => {
  it("sends owners and staff with a finished shop to the dashboard", () => {
    expect(
      destinationAfterAuth({
        hasMembership: true,
        setupCompleted: true,
        isPlatformAdmin: false,
      }),
    ).toBe("/dashboard");
  });

  it("sends a merchant who still needs setup to /setup, not create-shop", () => {
    expect(
      destinationAfterAuth({
        hasMembership: true,
        setupCompleted: false,
        isPlatformAdmin: false,
      }),
    ).toBe("/setup");
  });

  it("treats unknown setup on a known shop as /setup", () => {
    expect(
      destinationAfterAuth({
        hasMembership: true,
        setupCompleted: null,
        isPlatformAdmin: false,
      }),
    ).toBe("/setup");
  });

  it("does not send a shop owner to /admin even if they are also a platform admin", () => {
    expect(
      destinationAfterAuth({
        hasMembership: true,
        setupCompleted: true,
        isPlatformAdmin: true,
      }),
    ).toBe("/dashboard");
  });

  it("sends a platform administrator with no shop to /admin", () => {
    expect(
      destinationAfterAuth({
        hasMembership: false,
        setupCompleted: null,
        isPlatformAdmin: true,
      }),
    ).toBe("/admin");
  });

  it("sends a signed-in user with no shop to onboarding, not a missing customer route", () => {
    expect(
      destinationAfterAuth({
        hasMembership: false,
        setupCompleted: null,
        isPlatformAdmin: false,
      }),
    ).toBe("/onboarding");
  });

  it("does not dump a returning merchant onto onboarding when membership is unknown", () => {
    expect(
      destinationAfterAuth({
        hasMembership: null,
        setupCompleted: null,
        isPlatformAdmin: false,
      }),
    ).toBe("/dashboard");
  });
});

describe("shouldSendToCreateShop", () => {
  it("does not treat a failed workspace load as a missing shop", () => {
    expect(
      shouldSendToCreateShop({
        isLoading: false,
        isError: true,
        workspace: undefined,
      }),
    ).toBe(false);
  });

  it("does not redirect while the workspace is still loading", () => {
    expect(
      shouldSendToCreateShop({
        isLoading: true,
        isError: false,
        workspace: undefined,
      }),
    ).toBe(false);
  });

  it("opens create-shop only when membership loaded as empty", () => {
    expect(
      shouldSendToCreateShop({
        isLoading: false,
        isError: false,
        workspace: null,
      }),
    ).toBe(true);
    expect(
      shouldSendToCreateShop({
        isLoading: false,
        isError: false,
        workspace: { business: { id: "biz" } },
      }),
    ).toBe(false);
  });
});

describe("onboardingPageDestination", () => {
  it("keeps people without a shop on the create-shop wizard", () => {
    expect(onboardingPageDestination({ hasMembership: false, setupCompleted: null })).toBeNull();
  });

  it("sends an existing shop still in setup to /setup, not the wizard", () => {
    expect(onboardingPageDestination({ hasMembership: true, setupCompleted: false })).toBe(
      "/setup",
    );
    expect(onboardingPageDestination({ hasMembership: true, setupCompleted: null })).toBe("/setup");
  });

  it("sends a finished shop to the dashboard", () => {
    expect(onboardingPageDestination({ hasMembership: true, setupCompleted: true })).toBe(
      "/dashboard",
    );
  });
});

describe("applyOAuthNext", () => {
  it("ignores a client next that disagrees with the database destination", () => {
    expect(applyOAuthNext("/dashboard", "/setup")).toBe("/setup");
    expect(applyOAuthNext("/onboarding", "/dashboard")).toBe("/dashboard");
  });

  it("keeps the destination when next matches", () => {
    expect(applyOAuthNext("/setup", "/setup")).toBe("/setup");
  });
});
