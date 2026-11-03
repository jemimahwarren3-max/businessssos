import { describe, expect, it } from "vitest";
import {
  authEmailLinkHasCredential,
  otpTypeFromLink,
  parseAuthEmailLink,
  parseAuthHash,
  postAuthPathForLinkType,
} from "@/lib/auth/parse-auth-hash";

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

describe("parseAuthEmailLink", () => {
  it("keeps hash recovery tokens when there is no ?code=", () => {
    const link = parseAuthEmailLink({}, "#access_token=abc&refresh_token=def&type=recovery");
    expect(authEmailLinkHasCredential(link)).toBe(true);
    expect(link.hash?.type).toBe("recovery");
    expect(link.code).toBeUndefined();
  });

  it("reads token_hash OTP recovery links", () => {
    const link = parseAuthEmailLink({ token_hash: "otp-hash", type: "recovery" }, "");
    expect(link.tokenHash).toBe("otp-hash");
    expect(otpTypeFromLink(link.type)).toBe("recovery");
  });

  it("does not treat a missing link as a credential", () => {
    expect(authEmailLinkHasCredential(parseAuthEmailLink({}, ""))).toBe(false);
  });
});
