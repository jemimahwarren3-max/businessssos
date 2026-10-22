const WISHLIST_KEY = (slug: string) => `kwetuu-wishlist:${slug}`;
const RECENT_KEY = (slug: string) => `kwetuu-recent:${slug}`;
const MAX_RECENT = 12;

function readIds(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === "string").slice(0, MAX_RECENT)
      : [];
  } catch {
    return [];
  }
}

export function readWishlist(slug: string) {
  return readIds(WISHLIST_KEY(slug));
}

export function toggleWishlist(slug: string, productId: string) {
  const current = readWishlist(slug);
  const next = current.includes(productId)
    ? current.filter((id) => id !== productId)
    : [productId, ...current].slice(0, MAX_RECENT);
  localStorage.setItem(WISHLIST_KEY(slug), JSON.stringify(next));
  return next;
}

export function readRecentlyViewed(slug: string) {
  return readIds(RECENT_KEY(slug));
}

export function recordRecentlyViewed(slug: string, productId: string) {
  const next = [productId, ...readRecentlyViewed(slug).filter((id) => id !== productId)].slice(
    0,
    MAX_RECENT,
  );
  localStorage.setItem(RECENT_KEY(slug), JSON.stringify(next));
  return next;
}

export function toggleProductId(ids: string[], productId: string) {
  return ids.includes(productId)
    ? ids.filter((id) => id !== productId)
    : [productId, ...ids].slice(0, MAX_RECENT);
}

export function recentProductIds(ids: string[], productId: string) {
  return [productId, ...ids.filter((id) => id !== productId)].slice(0, MAX_RECENT);
}
