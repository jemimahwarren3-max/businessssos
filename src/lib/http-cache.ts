/** HTTP cache policy for public storefronts. Never share-cache private data. */

const PRIVATE_SHOP_SUFFIXES = ["/cart", "/checkout", "/account", "/search"];

export function isPublicCachableHttpPath(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (path === "/" || path === "/market" || path === "/about" || path === "/pricing") {
    return true;
  }
  const store = path.match(/^\/store\/([^/]+)(?:\/(.*))?$/);
  if (!store) return false;
  const rest = store[2] ? `/${store[2]}` : "";
  if (!rest) return true;
  if (PRIVATE_SHOP_SUFFIXES.some((suffix) => rest === suffix || rest.startsWith(`${suffix}/`))) {
    return false;
  }
  if (rest.startsWith("/order")) return false;
  if (rest.startsWith("/products/")) return true;
  return false;
}

/** Short shared cache for anonymous shop HTML. Checkout re-reads price/stock. */
export const PUBLIC_STOREFRONT_CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=300";
