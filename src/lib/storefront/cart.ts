export type CartLine = { productId: string; quantity: number; note?: string };

const CART_KEY = (slug: string, userId?: string | null) =>
  userId ? `bos-cart:${slug}:user:${userId}` : `bos-cart:${slug}`;

function normalizeCartLine(value: unknown): CartLine | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<CartLine>;
  const productId = typeof candidate.productId === "string" ? candidate.productId.trim() : "";
  const quantity = Number(candidate.quantity);
  if (!productId || !Number.isInteger(quantity) || quantity <= 0) return null;

  const note = typeof candidate.note === "string" ? candidate.note.trim().slice(0, 200) : undefined;
  const normalizedNote = note && note.length > 0 ? note : undefined;

  return { productId, quantity, ...(normalizedNote ? { note: normalizedNote } : {}) };
}

function normalizeCartLines(value: unknown): CartLine[] {
  if (!Array.isArray(value)) return [];
  const normalized = value.map(normalizeCartLine).filter((line): line is CartLine => line !== null);
  return mergeCartLines(normalized);
}

function mergeCartLines(lines: CartLine[]) {
  const merged = new Map<string, CartLine>();
  for (const line of lines) {
    const current = merged.get(line.productId) ?? { productId: line.productId, quantity: 0 };
    current.quantity += line.quantity;
    if (!current.note && line.note) current.note = line.note;
    merged.set(line.productId, current);
  }
  return Array.from(merged.values()).filter((line) => line.quantity > 0);
}

export function readCart(slug: string, userId?: string | null): CartLine[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_KEY(slug, userId ?? null)) ?? "[]");
    return normalizeCartLines(parsed);
  } catch {
    return [];
  }
}

export function writeCart(slug: string, lines: CartLine[], userId?: string | null) {
  if (typeof localStorage === "undefined") return;
  const sanitized = normalizeCartLines(lines);
  localStorage.setItem(CART_KEY(slug, userId ?? null), JSON.stringify(sanitized));
}

export function mergeGuestCartIntoUserCart(slug: string, userId: string): CartLine[] {
  if (typeof localStorage === "undefined") return [];
  const guestLines = readCart(slug);
  const signedInLines = readCart(slug, userId);
  const merged = mergeCartLines([...guestLines, ...signedInLines]);
  writeCart(slug, merged, userId);
  localStorage.removeItem(CART_KEY(slug));
  return merged;
}

export function orderTokenKey(slug: string, reference: string) {
  return `bos-order-token:${slug}:${reference}`;
}
