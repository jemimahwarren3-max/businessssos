/** Session cookies must be Secure on HTTPS hosts. Local and temporary
 * HTTP deployments (including some Cloud Run revisions behind no TLS yet)
 * cannot set a Secure cookie, so the flag follows APP_URL. */
export function isSessionCookieSecure(appUrl: string | undefined): boolean {
  if (!appUrl) return true;
  return !appUrl.trim().toLowerCase().startsWith("http://");
}

export function isPrivateHttpPath(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return (
    path.startsWith("/dashboard") ||
    path.startsWith("/settings") ||
    path.startsWith("/sales") ||
    path.startsWith("/inventory") ||
    path.startsWith("/customers") ||
    path.startsWith("/invoices") ||
    path.startsWith("/quotes") ||
    path.startsWith("/expenses") ||
    path.startsWith("/reports") ||
    path.startsWith("/insights") ||
    path.startsWith("/assistant") ||
    path.startsWith("/storefront") ||
    path.startsWith("/suppliers") ||
    path.startsWith("/commission") ||
    path.startsWith("/time-clock") ||
    path.startsWith("/purchase-orders") ||
    path.startsWith("/recurring-invoices") ||
    path.startsWith("/sale-history") ||
    path.startsWith("/onboarding") ||
    path.startsWith("/admin") ||
    path.startsWith("/help") ||
    path.startsWith("/billing")
  );
}
