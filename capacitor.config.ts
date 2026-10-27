import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Release APK loads the live merchant entrypoint (same as desktop v1) so
 * Supabase auth, httpOnly session cookies, and TanStack server functions
 * work without a cross-origin bundled client. Set CAPACITOR_SERVER_URL empty
 * and run `npm run build` before `cap sync` to test a bundled webDir instead.
 */
const serverUrl = process.env["CAPACITOR_SERVER_URL"] ?? "https://mykwetuu.com/staff-login";

const config: CapacitorConfig = {
  appId: "com.mykwetuu.app",
  appName: "Kwetuu",
  webDir: ".output/public",
  server: {
    url: serverUrl,
    cleartext: false,
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
