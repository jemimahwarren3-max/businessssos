/** Short hover help for navigation and common actions (plain language). */

export const MAIN_NAV_HINTS: Record<string, string> = {
  "/dashboard": "See today's sales, what's low in stock, and quick links to act.",
  "/sales": "Record in-person sales, print receipts, and sync when you're back online.",
  "/storefront":
    "Design your online shop, set delivery and payments, then publish when you're ready.",
  "/online-orders":
    "Online shop orders — confirm payment, prepare, dispatch, or mark ready for collection.",
  "/branches": "Physical locations, default POS branch, and per-location stock (where configured).",
  "/inventory": "Products, stock levels, and adjustments across your locations.",
  "/suppliers": "Who you buy from and their contact details.",
  "/purchase-orders": "Orders you place with suppliers before stock arrives.",
  "/invoices": "Bill customers, track what's owed, and record when they pay.",
  "/quotes": "Send a price estimate before you turn it into an invoice or sale.",
  "/customers": "People you sell to — balances, contact info, and history.",
  "/expenses": "Money going out: rent, stock, fuel, and other running costs.",
  "/reports": "Sales, profit, and tax-style summaries over a date range.",
  "/growth": "Draft campaigns and see how visitors and orders are trending.",
  "/insights": "AI weekly summary and stock forecasts from your real numbers.",
  "/assistant": "Ask questions about your business data — it never changes records on its own.",
};

export const SECONDARY_NAV_HINTS: Record<string, string> = {
  "/settings/team": "Invite staff and choose who can sell, edit stock, or manage billing.",
  "/cash-drawer": "Open and close the till, pay in/out, and match counted cash.",
  "/time-clock": "Staff clock in and out for shift tracking.",
  "/settings/payments":
    "Two areas: Kwetuu subscription billing vs payment methods your customers use at checkout.",
  "/settings/billing": "Your Kwetuu Pro subscription — separate from customer shop payments.",
  "/settings/data": "Download a copy of your business data.",
  "/settings/audit-log": "Who changed what — useful for disputes and year-end checks.",
  "/settings/account": "Your sign-in email, password, and notification preferences.",
  "/help": "Guides and answers without leaving the app.",
};

export const HEADER_HINTS = {
  quickAdd:
    "Describe a sale, expense, or stock change in one sentence. You review before anything is saved.",
  notifications: "Orders, low stock, and other alerts for this business.",
  account: "Sign out or switch workspace from another tab.",
  role: "Your permissions in this business — owners can manage billing and team.",
  plan: "Your Kwetuu plan. Shop customer payments are separate.",
} as const;

export const INVOICE_HINTS = {
  recurring: "Automatically recreate the same invoice on a schedule (e.g. monthly retainers).",
  newInvoice:
    "Add line items, set a due date, then mark sent when the customer has it. Record payments as they arrive.",
  export: "Spreadsheet of all invoices for your accountant or tax prep.",
  search: "Type part of an invoice number, e.g. INV-0042.",
  firstInvoice: "Pick a customer, add products or custom lines, and save as draft or send.",
} as const;
