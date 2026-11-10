import { describe, expect, it, afterEach } from "vitest";
import { loadMerchantApkDownload, loadMerchantAppInstall } from "../src/lib/merchant-apk.server";

describe("loadMerchantApkDownload", () => {
  const keys = [
    "MERCHANT_APK_URL",
    "MERCHANT_APK_VERSION",
    "MERCHANT_APK_SHA256",
    "MERCHANT_APK_UPDATED_AT",
    "MERCHANT_PLAY_STORE_URL",
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

  it("exposes Play Store when MERCHANT_PLAY_STORE_URL is set", () => {
    process.env["MERCHANT_PLAY_STORE_URL"] =
      "https://play.google.com/store/apps/details?id=com.mykwetuu.app";
    expect(loadMerchantAppInstall().playStoreAvailable).toBe(true);
  });
});
