import { createServerFn } from "@tanstack/react-start";
import { loadMerchantAppInstall } from "@/lib/merchant-apk.server";

/** Install links for /download (APK sideload + Play Store). */
export const getMerchantApkDownloadFn = createServerFn({ method: "GET" }).handler(async () =>
  loadMerchantAppInstall(),
);
