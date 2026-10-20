/** The service worker is registered only from the signed-in app so a shop
 * subdomain or the marketplace never installs a worker that falls back to
 * the merchant dashboard. */
export function registerAuthenticatedPwa() {
  if (typeof window === "undefined") return;
  void import("virtual:pwa-register").then(({ registerSW }) => {
    registerSW({ immediate: true });
  });
}
