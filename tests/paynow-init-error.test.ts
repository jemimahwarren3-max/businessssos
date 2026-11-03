import { describe, expect, it } from "vitest";
import { PAYNOW_INIT_FALLBACK, userFacingPaynowInitError } from "@/lib/payments/paynow-init-error";

describe("userFacingPaynowInitError", () => {
  it("passes through a short Paynow merchant error", () => {
    expect(
      userFacingPaynowInitError({
        success: false,
        error: "Invalid integration details received",
      }),
    ).toBe("Invalid integration details received.");
  });

  it("does not leak keys or stack traces", () => {
    expect(
      userFacingPaynowInitError({
        success: false,
        error: "integration key abcdef is invalid",
      }),
    ).toBe(PAYNOW_INIT_FALLBACK);
    expect(userFacingPaynowInitError(undefined, new Error("fetch failed"))).toBe(
      PAYNOW_INIT_FALLBACK,
    );
  });
});
