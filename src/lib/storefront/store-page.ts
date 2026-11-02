/** Decide what /store/$slug should do when the public or preview fetch is empty. */
export type StorePageDecision =
  { kind: "ok"; preview: boolean } | { kind: "setup" } | { kind: "unpublished" };

export function decideStorePage(input: {
  preview: boolean;
  storeFound: boolean;
  previewFailed?: boolean;
}): StorePageDecision {
  if (input.preview) {
    if (input.storeFound && !input.previewFailed) return { kind: "ok", preview: true };
    return { kind: "setup" };
  }
  if (input.storeFound) return { kind: "ok", preview: false };
  return { kind: "unpublished" };
}

export const UNPUBLISHED_SHOP = {
  title: "This shop isn't live yet",
  body: "If this is your shop, nothing was deleted. Your products and settings are still saved — continue setup instead of starting over.",
  setupLabel: "Continue setup",
  homeLabel: "Kwetuu home",
} as const;
