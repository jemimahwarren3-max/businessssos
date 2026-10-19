import { describe, expect, it } from "vitest";
import { isPrivateHttpPath, isSessionCookieSecure } from "@/lib/auth/session-cookie";

describe("session cookie flags", () => {
  it("uses Secure cookies on HTTPS and not on plain HTTP", () => {
    expect(isSessionCookieSecure("https://app.example.com")).toBe(true);
    expect(isSessionCookieSecure("http://localhost:8080")).toBe(false);
    expect(isSessionCookieSecure(undefined)).toBe(true);
  });

  it("marks merchant pages as private for cache headers", () => {
    expect(isPrivateHttpPath("/dashboard")).toBe(true);
    expect(isPrivateHttpPath("/sales")).toBe(true);
    expect(isPrivateHttpPath("/market")).toBe(false);
    expect(isPrivateHttpPath("/")).toBe(false);
  });
});
