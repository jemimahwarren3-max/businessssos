import { describe, expect, it } from "vitest";
import { friendlySignUpError } from "@/lib/auth/signup-errors";

describe("friendlySignUpError", () => {
  it("explains when the Email provider is off", () => {
    expect(friendlySignUpError("email_provider_disabled Email signups are disabled")).toMatch(
      /Continue with Google/i,
    );
  });

  it("explains when confirmation mail cannot send", () => {
    expect(friendlySignUpError("Error sending confirmation email")).toMatch(/confirmation email/i);
  });

  it("suggests sign-in when Supabase reports duplicate registration", () => {
    expect(friendlySignUpError("User already registered")).toMatch(/Sign in/i);
  });
});
