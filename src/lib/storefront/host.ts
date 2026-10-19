// Public shops are served on {slug}.{platform host}, the same shape as
// Shopify. The router still matches /store/$slug internally. Draft preview
// stays on the platform host because the sign-in cookie is not shared with
// shop subdomains.

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
  return storePublicUrlOn(root, slug, path);
}

export function storePublicUrlOn(root: PlatformRoot, slug: string, path = "/"): string {
  const host = root.port ? `${slug}.${root.hostname}:${root.port}` : `${slug}.${root.hostname}`;
  const pathname = path.startsWith("/") ? path : `/${path}`;
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

export function rewriteStoreOutputUrl(url: URL, rootHostname: string): URL | undefined {
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

export function publicStoreRedirect(url: URL, root: PlatformRoot): string | null {
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
  if (isDraftPreview(url)) return null;
  const rewritten = rewriteStoreOutputUrl(url, root.hostname);
  if (!rewritten || rewritten.href === url.href) return null;
  return rewritten.href;
}

function shopPathSuffix(pathname: string): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (path === "/") return "/";
  if (path === "/cart" || path === "/checkout" || path === "/search") return path;
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
