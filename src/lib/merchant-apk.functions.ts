import { createServerFn } from "@tanstack/react-start";
import { loadMerchantApkDownload } from "@/lib/merchant-apk.server";

/** APK link for /download — configured on the server when a release is published. */
export const getMerchantApkDownloadFn = createServerFn({ method: "GET" }).handler(
  async () => loadMerchantApkDownload(),
);
