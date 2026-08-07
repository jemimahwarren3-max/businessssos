import { z } from "zod";

export const BUSINESS_TYPES = [
  { value: "grocery", label: "Grocery store" },
  { value: "boutique", label: "Boutique / clothing" },
  { value: "hardware", label: "Hardware store" },
  { value: "electronics", label: "Electronics shop" },
  { value: "pharmacy", label: "Pharmacy" },
  { value: "salon", label: "Salon / barber" },
  { value: "restaurant", label: "Restaurant / cafe" },
  { value: "bakery", label: "Bakery" },
  { value: "wholesale", label: "Wholesaler" },
  { value: "services", label: "Services / freelance" },
  { value: "other", label: "Something else" },
] as const;

export const CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "ZAR",
  "NGN",
  "KES",
  "GHS",
  "ZWL",
  "TZS",
  "UGX",
  "INR",
  "CAD",
  "AUD",
] as const;

export const businessTypeSchema = z.enum([
  "grocery",
  "boutique",
  "hardware",
  "electronics",
  "pharmacy",
  "salon",
  "restaurant",
  "bakery",
  "wholesale",
  "services",
  "other",
]);

export const createBusinessSchema = z.object({
  name: z.string().trim().min(2, "Business name is too short").max(120),
  businessType: businessTypeSchema,
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Use a 3-letter currency code"),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  address: z.string().trim().max(240).optional().or(z.literal("")),
});
export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;

export const productSchema = z.object({
  businessId: z.string().uuid(),
  name: z.string().trim().min(1, "Product name is required").max(160),
  sku: z.string().trim().max(60).optional().or(z.literal("")),
  barcode: z.string().trim().max(60).optional().or(z.literal("")),
  unit: z.string().trim().min(1).max(24).default("unit"),
  costPrice: z.coerce.number().min(0, "Cost cannot be negative").max(99999999),
  sellingPrice: z.coerce.number().min(0, "Price cannot be negative").max(99999999),
  stock: z.coerce.number().min(0, "Stock cannot be negative").max(99999999),
  minStock: z.coerce.number().min(0).max(99999999).default(0),
  taxRate: z.coerce.number().min(0).max(100).default(0),
  description: z.string().trim().max(600).optional().or(z.literal("")),
});
export type ProductInput = z.infer<typeof productSchema>;

export const customerSchema = z.object({
  businessId: z.string().uuid(),
  name: z.string().trim().min(1, "Customer name is required").max(160),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().email("Enter a valid email").max(200).optional().or(z.literal("")),
  address: z.string().trim().max(240).optional().or(z.literal("")),
  notes: z.string().trim().max(600).optional().or(z.literal("")),
});
export type CustomerInput = z.infer<typeof customerSchema>;

export const businessIdSchema = z.object({ businessId: z.string().uuid() });

export const stockAdjustSchema = z.object({
  businessId: z.string().uuid(),
  productId: z.string().uuid(),
  movementType: z.enum(["stock_in", "stock_out", "adjustment", "return"]),
  quantity: z.coerce.number().positive("Quantity must be greater than zero").max(99999999),
  reason: z.string().trim().max(240).optional().or(z.literal("")),
});
export type StockAdjustInput = z.infer<typeof stockAdjustSchema>;

/* --------------------------- invoices & quotes --------------------------- */

export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "mobile_money", label: "Mobile money" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "credit", label: "Credit" },
] as const;
export const paymentMethodSchema = z.enum([
  "cash",
  "card",
  "mobile_money",
  "bank_transfer",
  "credit",
]);

/* ---------------------------------- sales --------------------------------- */

export const saleItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().positive("Quantity must be greater than zero").max(99999999),
  unitPrice: z.coerce.number().min(0, "Price cannot be negative").max(99999999),
});
export type SaleItemInput = z.infer<typeof saleItemSchema>;

export const saleSchema = z.object({
  businessId: z.string().uuid(),
  customerId: z.string().uuid().optional().or(z.literal("")),
  discount: z.coerce.number().min(0, "Discount cannot be negative").max(99999999).default(0),
  paymentMethod: paymentMethodSchema,
  notes: z.string().trim().max(600).optional().or(z.literal("")),
  items: z.array(saleItemSchema).min(1, "Add at least one item"),
  idempotencyKey: z.string().uuid(),
});
export type SaleInput = z.infer<typeof saleSchema>;

export const lineItemSchema = z.object({
  productId: z.string().uuid().optional().or(z.literal("")),
  name: z.string().trim().min(1, "Item name is required").max(160),
  quantity: z.coerce.number().positive("Quantity must be greater than zero").max(99999999),
  unitPrice: z.coerce.number().min(0, "Price cannot be negative").max(99999999),
  taxRate: z.coerce.number().min(0).max(100).default(0),
});
export type LineItemInput = z.infer<typeof lineItemSchema>;

export const invoiceSchema = z.object({
  businessId: z.string().uuid(),
  customerId: z.string().uuid().optional().or(z.literal("")),
  issueDate: z.string().min(1),
  dueDate: z.string().optional().or(z.literal("")),
  notes: z.string().trim().max(600).optional().or(z.literal("")),
  terms: z.string().trim().max(600).optional().or(z.literal("")),
  discount: z.coerce.number().min(0, "Discount cannot be negative").max(99999999).default(0),
  items: z.array(lineItemSchema).min(1, "Add at least one item"),
  idempotencyKey: z.string().uuid(),
});
export type InvoiceInput = z.infer<typeof invoiceSchema>;

export const invoiceIdSchema = z.object({
  businessId: z.string().uuid(),
  invoiceId: z.string().uuid(),
});

export const invoiceStatusSchema = z.object({
  businessId: z.string().uuid(),
  invoiceId: z.string().uuid(),
  status: z.enum(["sent", "cancelled"]),
});
export type InvoiceStatusInput = z.infer<typeof invoiceStatusSchema>;

export const paymentSchema = z.object({
  businessId: z.string().uuid(),
  invoiceId: z.string().uuid(),
  amount: z.coerce.number().positive("Payment amount must be greater than zero").max(99999999),
  method: paymentMethodSchema,
  reference: z.string().trim().max(120).optional().or(z.literal("")),
  idempotencyKey: z.string().uuid(),
});
export type PaymentInput = z.infer<typeof paymentSchema>;

export const quoteSchema = z.object({
  businessId: z.string().uuid(),
  customerId: z.string().uuid().optional().or(z.literal("")),
  issueDate: z.string().min(1),
  validUntil: z.string().optional().or(z.literal("")),
  notes: z.string().trim().max(600).optional().or(z.literal("")),
  terms: z.string().trim().max(600).optional().or(z.literal("")),
  discount: z.coerce.number().min(0, "Discount cannot be negative").max(99999999).default(0),
  items: z.array(lineItemSchema).min(1, "Add at least one item"),
});
export type QuoteInput = z.infer<typeof quoteSchema>;

export const quoteIdSchema = z.object({
  businessId: z.string().uuid(),
  quoteId: z.string().uuid(),
});

export const quoteStatusSchema = z.object({
  businessId: z.string().uuid(),
  quoteId: z.string().uuid(),
  status: z.enum(["sent", "accepted", "declined"]),
});
export type QuoteStatusInput = z.infer<typeof quoteStatusSchema>;

export const convertQuoteSchema = z.object({
  businessId: z.string().uuid(),
  quoteId: z.string().uuid(),
  dueDate: z.string().optional().or(z.literal("")),
});
export type ConvertQuoteInput = z.infer<typeof convertQuoteSchema>;

/* -------------------------------- expenses -------------------------------- */

export const EXPENSE_CATEGORIES = [
  { value: "rent", label: "Rent" },
  { value: "utilities", label: "Utilities" },
  { value: "transport", label: "Transport" },
  { value: "salaries", label: "Salaries" },
  { value: "marketing", label: "Marketing" },
  { value: "supplies", label: "Supplies" },
  { value: "maintenance", label: "Maintenance" },
  { value: "other", label: "Other" },
] as const;

export const expenseSchema = z.object({
  businessId: z.string().uuid(),
  category: z.enum([
    "rent",
    "utilities",
    "transport",
    "salaries",
    "marketing",
    "supplies",
    "maintenance",
    "other",
  ]),
  description: z.string().trim().max(240).optional().or(z.literal("")),
  amount: z.coerce.number().positive("Amount must be greater than zero").max(99999999),
  expenseDate: z.string().min(1),
  method: paymentMethodSchema,
  vendor: z.string().trim().max(160).optional().or(z.literal("")),
});
export type ExpenseInput = z.infer<typeof expenseSchema>;

export const expenseIdSchema = z.object({
  businessId: z.string().uuid(),
  expenseId: z.string().uuid(),
});

/* --------------------------------- imports -------------------------------- */

export const productImportRowSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(160),
  sku: z.string().trim().max(60).optional().or(z.literal("")),
  barcode: z.string().trim().max(60).optional().or(z.literal("")),
  unit: z.string().trim().min(1).max(24).default("unit"),
  costPrice: z.coerce.number().min(0, "Cost cannot be negative").max(99999999).default(0),
  sellingPrice: z.coerce.number().min(0, "Price cannot be negative").max(99999999).default(0),
  stock: z.coerce.number().min(0, "Stock cannot be negative").max(99999999).default(0),
  minStock: z.coerce.number().min(0).max(99999999).default(0),
  taxRate: z.coerce.number().min(0).max(100).default(0),
});
export type ProductImportRow = z.infer<typeof productImportRowSchema>;

export const importProductsSchema = z.object({
  businessId: z.string().uuid(),
  rows: z.array(productImportRowSchema).min(1).max(500),
});

export const expenseImportRowSchema = z.object({
  expenseDate: z.string().min(1, "Date is required"),
  category: z.enum([
    "rent",
    "utilities",
    "transport",
    "salaries",
    "marketing",
    "supplies",
    "maintenance",
    "other",
  ]),
  description: z.string().trim().max(240).optional().or(z.literal("")),
  amount: z.coerce.number().positive("Amount must be greater than zero").max(99999999),
  vendor: z.string().trim().max(160).optional().or(z.literal("")),
});
export type ExpenseImportRow = z.infer<typeof expenseImportRowSchema>;

export const importExpensesSchema = z.object({
  businessId: z.string().uuid(),
  rows: z.array(expenseImportRowSchema).min(1).max(500),
});

export const saleHistoryImportRowSchema = z.object({
  saleDate: z.string().min(1, "Date is required"),
  total: z.coerce.number().positive("Total must be greater than zero").max(99999999),
  cost: z.coerce.number().min(0, "Cost cannot be negative").max(99999999).default(0),
  description: z.string().trim().max(240).optional().or(z.literal("")),
});
export type SaleHistoryImportRow = z.infer<typeof saleHistoryImportRowSchema>;

export const importSalesHistorySchema = z.object({
  businessId: z.string().uuid(),
  rows: z.array(saleHistoryImportRowSchema).min(1).max(500),
});

/* ----------------------------- AI assistant ------------------------------ */

export const assistantMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(4000),
});

export const askAssistantSchema = z.object({
  businessId: z.string().uuid(),
  messages: z.array(assistantMessageSchema).min(1).max(20),
});
