import { describe, expect, it } from "vitest";
import {
  PAYNOW_CREDENTIALS_REJECTED,
  PAYNOW_INIT_FALLBACK,
  userFacingPaynowInitError,
} from "@/lib/payments/paynow-init-error";

describe("userFacingPaynowInitError", () => {
  it("maps integration and hash failures to a credentials message", () => {
    expect(
      userFacingPaynowInitError({
        success: false,
        error: "Invalid integration details received",
      }),
    ).toBe(PAYNOW_CREDENTIALS_REJECTED);
    expect(userFacingPaynowInitError(undefined, new Error("Hashes do not match!"))).toBe(
      PAYNOW_CREDENTIALS_REJECTED,
    );
  });

  it("does not leak keys or stack traces", () => {
    expect(
      userFacingPaynowInitError({
        success: false,
        error: "integration key abcdef is invalid",
      }),
    ).toBe(PAYNOW_CREDENTIALS_REJECTED);
    expect(userFacingPaynowInitError(undefined, new Error("fetch failed"))).toBe(
      PAYNOW_INIT_FALLBACK,
    );
  });

  it("passes through a short non-credential Paynow error", () => {
    expect(
      userFacingPaynowInitError({
        success: false,
        error: "Amount is too low for this merchant",
      }),
    ).toBe("Amount is too low for this merchant.");
  });
});
