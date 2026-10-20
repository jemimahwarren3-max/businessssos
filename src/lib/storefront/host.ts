// Public shops can be served on {slug}.{platform host} (Shopify-style) or on
// /store/{slug} on the platform host. Cloud Run's default *.run.app URL cannot
// have extra DNS labels, so path URLs are the deploy default. Wildcard DNS
// plus SHOP_HOSTS=true turns subdomains on. The router still matches
// /store/$slug internally. Draft preview stays on the platform host because
// the sign-in cookie is not shared with shop subdomains.

export type PlatformRoot = {
  protocol: string;
  hostname: string;
  port: string;
};

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

export const RESERVED_HOST_LABELS = new Set([
  "account",
  "admin",
  "api",
  "app",
  "assets",
  "assistant",
  "auth",
  "billing",
  "cart",
  "cdn",
  "checkout",
  "commission",
  "customers",
  "dashboard",
  "expenses",
  "health",
  "help",
  "insights",
  "inventory",
  "invoices",
  "invite",
  "legal",
  "login",
  "mail",
  "market",
  "onboarding",
  "order",
  "privacy",
  "products",
  "public",
  "quotes",
  "reports",
  "reset-password",
  "robots",
  "sales",
  "search",
  "settings",
  "signup",
  "sitemap",
  "staff-login",
  "staging",
  "static",
  "store",
  "storefront",
  "stores",
  "suppliers",
  "terms",
  "www",
]);

const APP_PATH_PREFIXES = [
  "/admin",
  "/api",
  "/assistant",
  "/auth",
  "/billing",
  "/cash-drawer",
  "/commission",
  "/customers",
  "/dashboard",
  "/expenses",
  "/health",
  "/help",
  "/insights",
  "/inventory",
  "/invoices",
  "/invite",
  "/legal",
  "/market",
  "/onboarding",
  "/privacy",
  "/purchase-orders",
  "/quotes",
  "/recurring-invoices",
  "/reports",
  "/reset-password",
  "/robots.txt",
  "/sale-history",
  "/sales",
  "/settings",
  "/sitemap.xml",
  "/staff-login",
  "/storefront",
  "/suppliers",
  "/terms",
  "/time-clock",
];

export function parsePlatformRoot(origin: string): PlatformRoot {
  const url = new URL(origin);
  return { protocol: url.protocol, hostname: url.hostname, port: url.port };
}

export function configuredPlatformOrigin(): string | null {
  const fromVite = import.meta.env["VITE_APP_URL"];
  if (typeof fromVite === "string" && fromVite.trim()) return stripSlash(fromVite);
  if (typeof process !== "undefined") {
    const fromProcess = process.env["APP_URL"] || process.env["VITE_APP_URL"];
    if (fromProcess?.trim()) return stripSlash(fromProcess);
  }
  return null;
}

export function configuredPlatformRoot(): PlatformRoot | null {
  const origin = configuredPlatformOrigin();
  return origin ? parsePlatformRoot(origin) : null;
}

/** Explicit SHOP_HOSTS=true/false wins. Otherwise only localhost uses shop
 * subdomains, because browsers resolve `{slug}.localhost` without DNS. */
export function shopHostsEnabledFromOrigin(
  appUrl: string | undefined,
  flag: string | undefined,
): boolean {
  const normalized = (flag ?? "").trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "on") return true;
  if (normalized === "false" || normalized === "0" || normalized === "off") return false;
  if (!appUrl) return false;
  try {
    const host = new URL(appUrl).hostname.toLowerCase();
    return host === "localhost" || host.endsWith(".localhost");
  } catch {
    return false;
  }
}

export function shopHostsEnabled(): boolean {
  const flag =
    (typeof process !== "undefined" ? process.env["SHOP_HOSTS"] : undefined) ??
    (typeof import.meta.env["VITE_SHOP_HOSTS"] === "string"
      ? import.meta.env["VITE_SHOP_HOSTS"]
      : undefined);
  return shopHostsEnabledFromOrigin(configuredPlatformOrigin() ?? undefined, flag);
}

export function isStoreHostLabel(label: string): boolean {
  return SLUG.test(label) && !RESERVED_HOST_LABELS.has(label);
}

export function storeSlugFromHostname(hostname: string, rootHostname: string): string | null {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const root = rootHostname.toLowerCase();
  if (host === root || host === `www.${root}`) return null;
  const suffix = `.${root}`;
  if (!host.endsWith(suffix)) return null;
  const label = host.slice(0, -suffix.length);
  if (!label || label.includes(".")) return null;
  return isStoreHostLabel(label) ? label : null;
}

export function storePublicUrl(slug: string, path = "/"): string {
  const root = configuredPlatformRoot() ?? parsePlatformRoot("http://localhost:8080");
  return storePublicUrlOn(root, slug, path, shopHostsEnabled());
}

export function storePublicUrlOn(
  root: PlatformRoot,
  slug: string,
  path = "/",
  shopHosts = true,
): string {
  const pathname = path.startsWith("/") ? path : `/${path}`;
  const suffix = pathname === "/" ? "" : pathname;
  if (!shopHosts) {
    const origin = root.port
      ? `${root.protocol}//${root.hostname}:${root.port}`
      : `${root.protocol}//${root.hostname}`;
    return `${origin}/store/${slug}${suffix}`;
  }
  const host = root.port ? `${slug}.${root.hostname}:${root.port}` : `${slug}.${root.hostname}`;
  return `${root.protocol}//${host}${pathname === "/" ? "/" : pathname}`;
}

export function rewriteStoreInputUrl(url: URL, rootHostname: string): URL | undefined {
  const slug = storeSlugFromHostname(url.hostname, rootHostname);
  if (!slug) return undefined;
  if (url.pathname === `/store/${slug}` || url.pathname.startsWith(`/store/${slug}/`)) {
    return undefined;
  }
  const suffix = shopPathSuffix(url.pathname);
  if (suffix === null) return undefined;
  const next = new URL(url.href);
  next.pathname = suffix === "/" ? `/store/${slug}` : `/store/${slug}${suffix}`;
  return next;
}

export function rewriteStoreOutputUrl(
  url: URL,
  rootHostname: string,
  shopHosts = true,
): URL | undefined {
  if (!shopHosts) return undefined;
  if (isDraftPreview(url)) return undefined;
  const match = url.pathname.match(/^\/store\/([^/]+)(\/.*)?$/);
  if (!match) return undefined;
  const slug = match[1]?.toLowerCase() ?? "";
  if (!isStoreHostLabel(slug)) return undefined;
  const rest = match[2] && match[2] !== "/" ? match[2].replace(/\/+$/, "") : "/";
  const next = new URL(url.href);
  next.hostname = `${slug}.${rootHostname}`;
  next.pathname = rest;
  return next;
}

export function isDraftPreview(url: URL): boolean {
  const value = url.searchParams.get("preview");
  return value === "1" || value === '"1"';
}

export function publicStoreRedirect(url: URL, root: PlatformRoot, shopHosts = true): string | null {
  const slug = storeSlugFromHostname(url.hostname, root.hostname);
  if (slug) {
    if (shopPathSuffix(url.pathname) !== null) return null;
    if (!isPlatformPath(url.pathname)) return null;
    const next = new URL(url.href);
    next.protocol = root.protocol;
    next.hostname = root.hostname;
    next.port = root.port;
    if (next.href === url.href) return null;
    return next.href;
  }
  if (!shopHosts) return null;
  if (isDraftPreview(url)) return null;
  const rewritten = rewriteStoreOutputUrl(url, root.hostname, shopHosts);
  if (!rewritten || rewritten.href === url.href) return null;
  return rewritten.href;
}

function shopPathSuffix(pathname: string): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (path === "/") return "/";
  if (path === "/cart" || path === "/checkout" || path === "/search" || path === "/account") {
    return path;
  }
  if (path.startsWith("/products/") && path.length > "/products/".length) return path;
  if (path.startsWith("/order/") && path.length > "/order/".length) return path;
  return null;
}

function isPlatformPath(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return APP_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function stripSlash(value: string): string {
  return value.trim().replace(/\/+$/, "");
}
