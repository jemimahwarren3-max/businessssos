import { describe, expect, it } from "vitest";
import { friendlySignUpError } from "@/lib/auth/signup-errors";

describe("signup confirmation UX copy", () => {
  it("guides unconfirmed sign-in attempts", () => {
    expect(friendlySignUpError("Email not confirmed")).toMatch(/confirm your email/i);
  });

  it("maps SMTP failures without exposing secrets", () => {
    const message = friendlySignUpError("Error sending confirmation email SMTP timeout");
    expect(message).not.toMatch(/api[_-]?key/i);
    expect(message).toMatch(/google|confirmation/i);
  });
});
