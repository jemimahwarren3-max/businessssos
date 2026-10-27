const CART_PREFIX = "bos-cart:";

export type SavedCartSummary = {
  slug: string;
  lineCount: number;
  totalQuantity: number;
};

function linesForSlug(slug: string) {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(`${CART_PREFIX}${slug}`) ?? "[]") as {
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

/** Client-only: list non-empty per-shop carts persisted in localStorage. */
export function listSavedCarts(): SavedCartSummary[] {
  if (typeof localStorage === "undefined") return [];
  const out: SavedCartSummary[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key?.startsWith(CART_PREFIX)) continue;
    const slug = key.slice(CART_PREFIX.length);
    if (!slug) continue;
    const lines = linesForSlug(slug);
    if (lines.length === 0) continue;
    out.push({
      slug,
      lineCount: lines.length,
      totalQuantity: lines.reduce((sum, line) => sum + (line.quantity ?? 0), 0),
    });
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug));
}

export function savedCartCount(): number {
  return listSavedCarts().reduce((sum, cart) => sum + cart.lineCount, 0);
}
