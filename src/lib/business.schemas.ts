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
  "ZWG",
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
  phone: z.string().trim().max(40).default(""),
  address: z.string().trim().max(240).default(""),
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
  supplierId: z.string().uuid().optional().or(z.literal("")),
});
export type ProductInput = z.infer<typeof productSchema>;
export const productCreateFieldsSchema = productSchema.omit({ businessId: true });

export const customerSchema = z.object({
  businessId: z.string().uuid(),
  name: z.string().trim().min(1, "Customer name is required").max(160),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().email("Enter a valid email").max(200).optional().or(z.literal("")),
  address: z.string().trim().max(240).optional().or(z.literal("")),
  notes: z.string().trim().max(600).optional().or(z.literal("")),
});
export type CustomerInput = z.infer<typeof customerSchema>;

export const supplierSchema = z.object({
  businessId: z.string().uuid(),
  name: z.string().trim().min(1, "Supplier name is required").max(160),
  contactPerson: z.string().trim().max(160).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().email("Enter a valid email").max(200).optional().or(z.literal("")),
  address: z.string().trim().max(240).optional().or(z.literal("")),
  notes: z.string().trim().max(600).optional().or(z.literal("")),
});
export type SupplierInput = z.infer<typeof supplierSchema>;

export const updateSupplierSchema = supplierSchema.extend({ supplierId: z.string().uuid() });
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;

export const supplierIdSchema = z.object({
  businessId: z.string().uuid(),
  supplierId: z.string().uuid(),
});

export const businessIdSchema = z.object({ businessId: z.string().uuid() });

export const openCashSessionSchema = z.object({
  businessId: z.string().uuid(),
  openingFloat: z.coerce.number().min(0, "Opening float cannot be negative").max(99999999),
  note: z.string().trim().max(240).optional().or(z.literal("")),
});

export const closeCashSessionSchema = z.object({
  businessId: z.string().uuid(),
  countedCash: z.coerce.number().min(0, "Counted cash cannot be negative").max(99999999),
  note: z.string().trim().max(240).optional().or(z.literal("")),
});

export const addCashMovementSchema = z.object({
  businessId: z.string().uuid(),
  kind: z.enum(["pay_in", "pay_out"]),
  amount: z.coerce.number().positive("Amount must be greater than zero").max(99999999),
  note: z.string().trim().min(2, "Enter a reason").max(240),
});

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

export const listSalesSchema = z.object({
  businessId: z.string().uuid(),
  search: z.string().max(80).default(""),
});

export const saleIdSchema = z.object({
  businessId: z.string().uuid(),
  saleId: z.string().uuid(),
});

export const refundSaleSchema = z.object({
  businessId: z.string().uuid(),
  saleId: z.string().uuid(),
  reason: z.string().trim().max(300).optional().or(z.literal("")),
  items: z
    .array(
      z.object({
        saleItemId: z.string().uuid(),
        quantity: z.coerce.number().positive("Quantity must be greater than zero").max(99999999),
      }),
    )
    .min(1, "Select at least one item to refund"),
});
export type RefundSaleInput = z.infer<typeof refundSaleSchema>;

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

export const recurringInvoiceSchema = z.object({
  businessId: z.string().uuid(),
  customerId: z.string().uuid(),
  interval: z.enum(["weekly", "monthly", "quarterly", "yearly"]),
  startDate: z.string().min(1),
  dueDays: z.coerce.number().int().min(0).max(365).default(14),
  discount: z.coerce.number().min(0, "Discount cannot be negative").max(99999999).default(0),
  notes: z.string().trim().max(600).optional().or(z.literal("")),
  terms: z.string().trim().max(600).optional().or(z.literal("")),
  items: z.array(lineItemSchema).min(1, "Add at least one item"),
});
export type RecurringInvoiceInput = z.infer<typeof recurringInvoiceSchema>;

export const recurringInvoiceIdSchema = z.object({
  businessId: z.string().uuid(),
  recurringInvoiceId: z.string().uuid(),
});

export const setRecurringInvoiceActiveSchema = z.object({
  businessId: z.string().uuid(),
  recurringInvoiceId: z.string().uuid(),
  active: z.boolean(),
});

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

export const purchaseOrderSchema = z.object({
  businessId: z.string().uuid(),
  supplierId: z.string().uuid().optional().or(z.literal("")),
  orderDate: z.string().min(1),
  notes: z.string().trim().max(600).optional().or(z.literal("")),
  items: z.array(lineItemSchema).min(1, "Add at least one item"),
});
export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>;

export const purchaseOrderStatusSchema = z.object({
  businessId: z.string().uuid(),
  purchaseOrderId: z.string().uuid(),
  status: z.enum(["received", "cancelled"]),
});
export type PurchaseOrderStatusInput = z.infer<typeof purchaseOrderStatusSchema>;

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

export const customerImportRowSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(160),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().email("Enter a valid email").max(200).optional().or(z.literal("")),
  address: z.string().trim().max(240).optional().or(z.literal("")),
  notes: z.string().trim().max(600).optional().or(z.literal("")),
});
export type CustomerImportRow = z.infer<typeof customerImportRowSchema>;

export const importCustomersSchema = z.object({
  businessId: z.string().uuid(),
  rows: z.array(customerImportRowSchema).min(1).max(500),
});

export const saleLineImportRowSchema = z.object({
  saleDate: z.string().min(1, "Date is required"),
  product: z.string().trim().min(1, "Product is required").max(160),
  quantity: z.coerce.number().positive("Quantity must be greater than zero").max(99999999),
  unitPrice: z.coerce.number().min(0, "Price cannot be negative").max(99999999).optional(),
  customer: z.string().trim().max(160).optional().or(z.literal("")),
  paymentMethod: paymentMethodSchema.default("cash"),
});
export type SaleLineImportRow = z.infer<typeof saleLineImportRowSchema>;

export const importSalesDetailedSchema = z.object({
  businessId: z.string().uuid(),
  rows: z.array(saleLineImportRowSchema).min(1).max(500),
});

/* -------------------------------- billing -------------------------------- */

export const subscriptionCheckoutSchema = z.object({
  businessId: z.string().uuid(),
  plan: z.enum(["pro"]),
  channel: z.enum(["web", "ecocash", "onemoney"]),
  phone: z.string().trim().max(20).optional(),
  /** Omit to charge USD, or ZWG when the business currency is ZWG and ZiG Paynow keys exist. */
  billingCurrency: z.enum(["USD", "ZWG"]).optional(),
});
export type SubscriptionCheckoutInput = z.infer<typeof subscriptionCheckoutSchema>;

export const checkPaymentSchema = z.object({
  businessId: z.string().uuid(),
  reference: z.string().trim().min(1),
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

export const generateInvoiceDraftSchema = z.object({
  businessId: z.string().uuid(),
  request: z.string().trim().min(10).max(1000),
});

/* ------------------------------- quick add -------------------------------- */

export const quickEntrySchema = z.object({
  businessId: z.string().uuid(),
  text: z.string().trim().min(1).max(500),
});

/* --------------------------------- team ----------------------------------- */

export const teamRoleSchema = z.enum(["owner", "admin", "manager", "cashier", "accountant"]);
export const inviteRoleSchema = z.enum(["admin", "manager", "cashier", "accountant"]);

export const createInviteSchema = z.object({
  businessId: z.string().uuid(),
  role: inviteRoleSchema,
});

export const inviteTokenSchema = z.object({
  token: z.string().trim().min(1).max(200),
});

export const revokeInviteSchema = z.object({
  businessId: z.string().uuid(),
  inviteId: z.string().uuid(),
});

export const updateTeamMemberRoleSchema = z.object({
  businessId: z.string().uuid(),
  memberUserId: z.string().uuid(),
  role: teamRoleSchema,
});

export const removeTeamMemberSchema = z.object({
  businessId: z.string().uuid(),
  memberUserId: z.string().uuid(),
});

const staffPasswordSchema = z.string().min(8, "Use at least 8 characters.");

export const createStaffAccountSchema = z.object({
  businessId: z.string().uuid(),
  displayName: z.string().trim().min(1, "Name is required").max(80),
  password: staffPasswordSchema,
  role: inviteRoleSchema,
});

export const resetStaffPasswordSchema = z.object({
  businessId: z.string().uuid(),
  memberUserId: z.string().uuid(),
  newPassword: staffPasswordSchema,
});

export const staffLoginSchema = z.object({
  businessName: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(80),
  password: z.string().min(1),
});

export const setStaffPasswordSchema = z.object({
  businessId: z.string().uuid(),
  password: staffPasswordSchema,
});

export const verifyShopLoginSchema = z.object({
  businessName: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(200),
});

export const setRolePermissionSchema = z.object({
  businessId: z.string().uuid(),
  role: z.enum(["admin", "manager", "cashier", "accountant"]),
  permissionKey: z.string().trim().min(1).max(80),
  granted: z.boolean(),
});

export const clockInSchema = z.object({
  businessId: z.string().uuid(),
  note: z.string().trim().max(200).optional().or(z.literal("")),
});

export const timeEntriesReportSchema = z.object({
  businessId: z.string().uuid(),
  days: z.coerce.number().int().min(1).max(365).default(14),
});

export const adjustTimeEntrySchema = z.object({
  businessId: z.string().uuid(),
  entryId: z.string().uuid(),
  clockIn: z.string().min(1),
  clockOut: z.string().min(1),
});

export const timeEntryIdSchema = z.object({
  businessId: z.string().uuid(),
  entryId: z.string().uuid(),
});

export const commissionReportSchema = z.object({
  businessId: z.string().uuid(),
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export const setCommissionRateSchema = z.object({
  businessId: z.string().uuid(),
  memberUserId: z.string().uuid(),
  rate: z.coerce.number().min(0, "Rate cannot be negative").max(100, "Rate can't exceed 100%"),
});

export const listAuditLogsSchema = z.object({
  businessId: z.string().uuid(),
  offset: z.coerce.number().int().min(0).default(0),
});

export const listNotificationsSchema = z.object({
  businessId: z.string().uuid(),
  offset: z.coerce.number().int().min(0).max(500).optional(),
});

export const markNotificationReadSchema = z.object({
  notificationId: z.string().uuid(),
});

export const markAllNotificationsReadSchema = z.object({
  businessId: z.string().uuid(),
});

export const notifyEmailSchema = z.object({
  businessId: z.string().uuid(),
  enabled: z.boolean(),
});

export const listLocationsSchema = businessIdSchema.extend({
  includeInactive: z.boolean().optional(),
});

export const locationInputSchema = z.object({
  businessId: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required").max(120),
  address: z.string().trim().max(240).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
});

export const locationIdSchema = z.object({
  businessId: z.string().uuid(),
  locationId: z.string().uuid(),
});

export const updateLocationSchema = locationInputSchema.extend({
  locationId: z.string().uuid(),
});

/* ------------------------------- insights -------------------------------- */

export const weeklyReportSchema = z.object({
  businessId: z.string().uuid(),
  forceRegenerate: z.boolean().optional(),
});
