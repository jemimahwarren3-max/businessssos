/** Lets any page open the header Quick Add dialog without duplicating server logic. */
export const OPEN_QUICK_ADD_EVENT = "kwetuu:open-quick-add";

export function openQuickAddDialog() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_QUICK_ADD_EVENT));
}
