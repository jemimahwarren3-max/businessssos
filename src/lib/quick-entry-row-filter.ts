/** Rows that are not real products (footers, totals, disclaimers, payment lines). */
const JUNK_LABEL = new RegExp(
  [
    "^\\s*(?:grand\\s*)?total(?:s)?\\b",
    "^\\s*sub\\s*total\\b",
    "^\\s*(?:amount\\s*)?due\\b",
    "^\\s*credits?\\b",
    "^\\s*debits?\\b",
    "^\\s*allerg",
    "^\\s*balance\\b",
    "^\\s*change\\b",
    "^\\s*summary\\b",
    "^\\s*notes?\\b",
    "^\\s*disclaimer\\b",
    "^\\s*thank\\s+you\\b",
    "^\\s*page\\s+\\d",
    "^\\s*(?:cash|card|mobile)\\s*(?:total|payment)?\\b",
    "^\\s*vat\\s*total\\b",
    "^\\s*discount\\b",
    "^\\s*tip\\b",
    "^\\s*rounding\\b",
    "^\\s*\\*{2,}",
    "^\\s*-{2,}",
  ].join("|"),
  "i",
);

export function isLikelyJunkQuickAddRow(label: string): boolean {
  const trimmed = label.trim();
  if (!trimmed) return true;
  if (trimmed.length > 160) return true;
  if (/^\d+([.,]\d+)?$/.test(trimmed)) return true;
  if (JUNK_LABEL.test(trimmed)) return true;
  if (/\b(?:total|credit)s?\s*[:=]?\s*$/i.test(trimmed) && trimmed.length < 48) return true;
  if (/\ballerg(?:y|ies)\b/i.test(trimmed)) return true;
  if (/^contains\b/i.test(trimmed)) return true;
  if (/\bmay contain\b/i.test(trimmed)) return true;
  if (/^(?:sum|count)\s+of\b/i.test(trimmed)) return true;
  return false;
}
