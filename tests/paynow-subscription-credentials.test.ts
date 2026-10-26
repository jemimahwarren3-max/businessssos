import { afterEach, describe, expect, it, vi } from "vitest";
import {
  paynowCredentialsConfigured,
  paynowIntegrationId,
  paynowIntegrationKey,
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
});
