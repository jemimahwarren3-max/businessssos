/** Shown before inventory file import so headers map to the right fields. */
export const INVENTORY_IMPORT_COLUMN_GUIDE = [
  { label: "Name", headers: "Name, Product, Item" },
  { label: "Stock (opening qty)", headers: "Stock, SOH, Qty on hand, Quantity" },
  { label: "Cost price", headers: "Cost, Cost price, Buying price (what you paid)" },
  { label: "Retail / sell price", headers: "Retail, RSP, Selling price, Price (what customers pay)" },
  { label: "SKU", headers: "SKU, Code (optional)" },
] as const;

export const INVENTORY_IMPORT_BEFORE_YOU_IMPORT = [
  "Put one product per row. Use a header row with clear column names.",
  "Stock / SOH means how many units you have on hand, not money.",
  "Cost is what you paid; Retail or RSP is what you charge customers. Do not swap them.",
  "Totals, credits, allergy notes, and payment lines belong at the bottom, not as product names.",
] as const;

export const INVENTORY_IMPORT_NO_UNDO =
  "After you confirm, import cannot be reversed automatically. Use Back to cancel before importing, or edit products in Inventory afterward.";
