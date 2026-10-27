import { describe, expect, it } from "vitest";
// @ts-expect-error staging-auth-config.mjs is plain Node ESM
import { parseFromEmail } from "../scripts/staging-auth-config.mjs";

describe("parseFromEmail", () => {
  it("extracts address from display name form", () => {
    expect(parseFromEmail("Kwetuu <noreply@mykwetuu.com>")).toBe("noreply@mykwetuu.com");
  });

  it("accepts bare email", () => {
    expect(parseFromEmail("test@example.com")).toBe("test@example.com");
  });

  it("returns null for empty", () => {
    expect(parseFromEmail("")).toBeNull();
  });
});
