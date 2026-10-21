import { describe, expect, it } from "vitest";
import { parseAuthProviderStatus } from "@/lib/auth/auth-providers";
import { friendlySignUpError, isEmailProviderDisabled } from "@/lib/auth/signup-errors";

describe("parseAuthProviderStatus", () => {
  it("reads GoTrue's public settings shape", () => {
    expect(
      parseAuthProviderStatus({
        external: { email: false, google: true },
        disable_signup: false,
      }),
    ).toEqual({ email: false, google: true });
  });

  it("treats missing flags as off", () => {
    expect(parseAuthProviderStatus({})).toEqual({ email: false, google: false });
  });
});

describe("email provider disabled copy", () => {
  it("maps signup and login GoTrue payloads", () => {
    expect(friendlySignUpError("email_provider_disabled Email signups are disabled")).toMatch(
      /Continue with Google/i,
    );
    expect(friendlySignUpError("422 Email logins are disabled")).toMatch(/Continue with Google/i);
    expect(isEmailProviderDisabled("email_provider_disabled Email logins are disabled")).toBe(true);
  });
});
