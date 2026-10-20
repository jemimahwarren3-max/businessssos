import { describe, expect, it } from "vitest";
import { googleOAuthRedirectTo } from "@/lib/auth/google-oauth";

describe("googleOAuthRedirectTo", () => {
  it("sends sign-in to the PKCE callback with next=/dashboard", () => {
    expect(googleOAuthRedirectTo("https://mykwetuu.com", { next: "/dashboard" })).toBe(
      "https://mykwetuu.com/auth/callback?next=%2Fdashboard",
    );
  });

  it("sends sign-up through onboarding and records terms acceptance", () => {
    expect(
      googleOAuthRedirectTo("https://mykwetuu.com/", {
        next: "/onboarding",
        acceptedTerms: true,
      }),
    ).toBe("https://mykwetuu.com/auth/callback?next=%2Fonboarding&acceptedTerms=1");
  });

  it("does not stamp acceptedTerms on a plain sign-in", () => {
    const url = googleOAuthRedirectTo("https://kwetuu-xxxxx.run.app", { next: "/dashboard" });
    expect(url).not.toContain("acceptedTerms");
  });
});
