import { describe, expect, it, afterEach } from "vitest";
import { loadMerchantApkDownload } from "../src/lib/merchant-apk.server";

describe("loadMerchantApkDownload", () => {
  const keys = [
    "MERCHANT_APK_URL",
    "MERCHANT_APK_VERSION",
    "MERCHANT_APK_SHA256",
    "MERCHANT_APK_UPDATED_AT",
  ] as const;

  afterEach(() => {
    for (const key of keys) delete process.env[key];
  });

  it("reports unavailable when URL is unset", () => {
    expect(loadMerchantApkDownload()).toEqual({
      available: false,
      url: "",
      version: "",
      sha256: "",
      updatedAt: "",
    });
  });

  it("returns public metadata when configured", () => {
    process.env["MERCHANT_APK_URL"] = "https://example.com/kwetuu.apk";
    process.env["MERCHANT_APK_VERSION"] = "2026.11.10";
    expect(loadMerchantApkDownload().available).toBe(true);
    expect(loadMerchantApkDownload().url).toContain("kwetuu.apk");
  });
});
