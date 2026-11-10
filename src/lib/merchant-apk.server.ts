/** Public merchant install metadata. Set on Cloud Run, not in the client bundle. */
export type MerchantApkDownload = {
  available: boolean;
  url: string;
  version: string;
  sha256: string;
  updatedAt: string;
};

export type MerchantAppInstallInfo = MerchantApkDownload & {
  playStoreUrl: string;
  playStoreAvailable: boolean;
};

export function loadMerchantApkDownload(): MerchantApkDownload {
  const url = process.env["MERCHANT_APK_URL"]?.trim() ?? "";
  const version = process.env["MERCHANT_APK_VERSION"]?.trim() ?? "";
  const sha256 = process.env["MERCHANT_APK_SHA256"]?.trim() ?? "";
  const updatedAt = process.env["MERCHANT_APK_UPDATED_AT"]?.trim() ?? "";
  return {
    available: url.length > 0,
    url,
    version,
    sha256,
    updatedAt,
  };
}

export function loadMerchantAppInstall(): MerchantAppInstallInfo {
  const apk = loadMerchantApkDownload();
  const playStoreUrl = process.env["MERCHANT_PLAY_STORE_URL"]?.trim() ?? "";
  return {
    ...apk,
    playStoreUrl,
    playStoreAvailable: playStoreUrl.length > 0,
  };
}
