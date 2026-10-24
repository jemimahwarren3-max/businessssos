import { describe, expect, it } from "vitest";
import { parseAuthHash, postAuthPathForLinkType } from "@/lib/auth/parse-auth-hash";

describe("parseAuthHash", () => {
  it("reads recovery tokens from hash", () => {
    const hash = "#access_token=abc&refresh_token=def&type=recovery&token_type=bearer";
    expect(parseAuthHash(hash)).toEqual({
      accessToken: "abc",
      refreshToken: "def",
      type: "recovery",
    });
    expect(postAuthPathForLinkType("recovery")).toBe("/reset-password");
  });

  it("defaults signup links to onboarding", () => {
    expect(postAuthPathForLinkType("signup")).toBe("/onboarding");
    expect(postAuthPathForLinkType(null)).toBe("/onboarding");
  });
});
