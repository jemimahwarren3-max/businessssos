export type ProductMatchRow = { id: string; name: string };

export function normalizeProductLabel(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function significantTokens(hint: string): string[] {
  const stop = new Set([
    "the",
    "and",
    "for",
    "with",
    "from",
    "qty",
    "item",
    "unit",
    "each",
    "case",
    "cases",
  ]);
  return normalizeProductLabel(hint)
    .split(/\s+/)
    .filter((token) => token.length > 1 && !stop.has(token));
}

/** Score how well a catalogue name fits the user's hint (0–100). */
export function scoreProductName(hint: string, productName: string): number {
  const h = normalizeProductLabel(hint);
  const p = normalizeProductLabel(productName);
  if (!h || !p) return 0;
  if (p === h) return 100;
  if (p.includes(h) || h.includes(p)) return 85;

  const hTokens = significantTokens(hint);
  if (hTokens.length === 0) return 0;

  const pNorm = ` ${p} `;
  let matched = 0;
  for (const token of hTokens) {
    if (pNorm.includes(` ${token} `) || p.includes(token)) matched += 1;
    else if (p.split(/\s+/).some((part) => part.startsWith(token) || token.startsWith(part))) {
      matched += 0.65;
    }
  }
  return (matched / hTokens.length) * 75;
}

const MIN_SCORE = 42;

export function pickBestProductMatch<T extends ProductMatchRow>(
  hint: string,
  products: T[],
): T | undefined {
  let best: T | undefined;
  let bestScore = 0;
  for (const row of products) {
    const score = scoreProductName(hint, row.name);
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }
  if (!best || bestScore < MIN_SCORE) return undefined;
  return best;
}
