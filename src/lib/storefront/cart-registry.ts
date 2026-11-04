const CART_PREFIX = "bos-cart:";

export type SavedCartSummary = {
  slug: string;
  lineCount: number;
  totalQuantity: number;
};

function linesForKey(key: string) {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "[]") as {
      productId?: string;
      quantity?: number;
    }[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (line) => line && typeof line.productId === "string" && (line.quantity ?? 0) > 0,
    );
  } catch {
    return [];
  }
}

function slugForCartKey(key: string): string | null {
  if (!key.startsWith(CART_PREFIX)) return null;
  const suffix = key.slice(CART_PREFIX.length);
  if (!suffix) return null;
  const userMarker = suffix.indexOf(":user:");
  return userMarker === -1 ? suffix : suffix.slice(0, userMarker);
}

/** Client-only: list non-empty per-shop carts persisted in localStorage. */
export function listSavedCarts(): SavedCartSummary[] {
  if (typeof localStorage === "undefined") return [];
  const carts = new Map<string, SavedCartSummary>();

  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key) continue;
    const slug = slugForCartKey(key);
    if (!slug) continue;
    const lines = linesForKey(key);
    if (lines.length === 0) continue;

    const existing = carts.get(slug) ?? {
      slug,
      lineCount: 0,
      totalQuantity: 0,
    };
    existing.lineCount += lines.length;
    existing.totalQuantity += lines.reduce((sum, line) => sum + (line.quantity ?? 0), 0);
    carts.set(slug, existing);
  }

  return Array.from(carts.values()).sort((a, b) => a.slug.localeCompare(b.slug));
}

export function savedCartCount(): number {
  return listSavedCarts().reduce((sum, cart) => sum + cart.lineCount, 0);
}
