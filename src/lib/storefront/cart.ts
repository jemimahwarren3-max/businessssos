export type CartLine = { productId: string; quantity: number; note?: string };

const CART_KEY = (slug: string) => `bos-cart:${slug}`;

export function readCart(slug: string): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_KEY(slug)) ?? "[]") as CartLine[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((line) => line && typeof line.productId === "string" && line.quantity > 0);
  } catch {
    return [];
  }
}

export function writeCart(slug: string, lines: CartLine[]) {
  localStorage.setItem(CART_KEY(slug), JSON.stringify(lines));
}

export function orderTokenKey(slug: string, reference: string) {
  return `bos-order-token:${slug}:${reference}`;
}
