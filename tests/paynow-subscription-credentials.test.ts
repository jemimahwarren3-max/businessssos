import { afterEach, describe, expect, it, vi } from "vitest";
import {
  paynowCredentialsConfigured,
  paynowIntegrationId,
  paynowIntegrationKey,
  platformPaynowCredentialPairs,
} from "@/lib/payments/paynow-credentials.server";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("platform Paynow subscription credentials", () => {
  it("reads USD and ZiG integration keys separately", () => {
    vi.stubEnv("PAYNOW_INTEGRATION_ID", "usd-id");
    vi.stubEnv("PAYNOW_INTEGRATION_KEY", "usd-key");
    vi.stubEnv("PAYNOW_INTEGRATION_ID_ZIG", "zig-id");
    vi.stubEnv("PAYNOW_INTEGRATION_KEY_ZIG", "zig-key");

    expect(paynowIntegrationId("USD")).toBe("usd-id");
    expect(paynowIntegrationKey("USD")).toBe("usd-key");
    expect(paynowIntegrationId("ZWG")).toBe("zig-id");
    expect(paynowIntegrationKey("ZWG")).toBe("zig-key");
    expect(paynowCredentialsConfigured("USD")).toBe(true);
    expect(paynowCredentialsConfigured("ZWG")).toBe(true);
  });

  it("strips wrapping quotes copied from dashboards", () => {
    vi.stubEnv("PAYNOW_INTEGRATION_ID", `"12345"`);
    vi.stubEnv("PAYNOW_INTEGRATION_KEY", `'usd-key'`);
    vi.stubEnv("PAYNOW_INTEGRATION_ID_ZIG", "");
    vi.stubEnv("PAYNOW_INTEGRATION_KEY_ZIG", "");

    expect(paynowIntegrationId("USD")).toBe("12345");
    expect(paynowIntegrationKey("USD")).toBe("usd-key");
    expect(platformPaynowCredentialPairs()).toEqual([
      { currency: "USD", integrationId: "12345", integrationKey: "usd-key" },
    ]);
  });
});
