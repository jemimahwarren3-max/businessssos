export const QUICK_ADD_INTENTS = [
  "inventory",
  "sales",
  "stock_in",
  "expense",
  "customer",
  "auto",
] as const;

export type QuickAddIntent = (typeof QUICK_ADD_INTENTS)[number];

export function quickAddIntentLabel(intent: QuickAddIntent): string {
  switch (intent) {
    case "inventory":
      return "Add products to inventory (list with SOH, prices, or names)";
    case "sales":
      return "Record sales from this file";
    case "stock_in":
      return "Record stock received (restock / delivery)";
    case "expense":
      return "Record expenses";
    case "customer":
      return "Add customers";
    case "auto":
      return "Let Kwetuu decide from the content";
  }
}

export function quickAddIntentForModel(intent: QuickAddIntent): string {
  switch (intent) {
    case "inventory":
      return "User goal: import or update INVENTORY (product catalogue). Use product_import shape mentally as purchase_batch with stock only, or purchase lines. NEVER import footer rows: totals, credits, allergies, disclaimers, payment summaries.";
    case "sales":
      return "User goal: record SALES. Use sale or sale_batch. Ignore totals/credits/allergy lines.";
    case "stock_in":
      return "User goal: STOCK RECEIVED (purchases). Use purchase or purchase_batch.";
    case "expense":
      return "User goal: EXPENSES. Use expense type.";
    case "customer":
      return "User goal: CUSTOMERS. Use customer type.";
    case "auto":
      return "Infer the best type from content. Skip spreadsheet footer rows (totals, credits, allergies, summaries).";
  }
}
