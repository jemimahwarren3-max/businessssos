import { describe, expect, it } from "vitest";
import { friendlySignUpError } from "@/lib/auth/signup-errors";

describe("friendlySignUpError", () => {
  it("explains when the Email provider is off", () => {
    expect(friendlySignUpError("email_provider_disabled Email signups are disabled")).toMatch(
      /Email sign-up is turned off/i,
    );
  });

  it("explains when confirmation mail cannot send", () => {
    expect(friendlySignUpError("Error sending confirmation email")).toMatch(/confirmation email/i);
  });

  it("does not reveal whether an email is already registered", () => {
    expect(friendlySignUpError("User already registered")).toBe(
      "We couldn't create that account. Please try again.",
    );
  });
});
