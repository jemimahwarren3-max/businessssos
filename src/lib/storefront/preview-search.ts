/** TanStack JSON-encodes string search values, so `preview: "1"` becomes
 *  `?preview="1"` (`%221%22`). Treat every common encoding as draft preview. */
export const STORE_PREVIEW_SEARCH = { preview: 1 as const };

export type StorePreviewSearch = { preview?: 1 };

export function isStorePreviewFlag(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value !== "string") return false;
  const normalized = value
    .trim()
    .replace(/^"+|"+$/g, "")
    .toLowerCase();
  return normalized === "1" || normalized === "true";
}

export function parseStorePreviewSearch(search: Record<string, unknown>): StorePreviewSearch {
  return isStorePreviewFlag(search["preview"]) ? STORE_PREVIEW_SEARCH : {};
}
