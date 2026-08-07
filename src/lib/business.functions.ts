import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  askAssistantSchema,
  businessIdSchema,
  convertQuoteSchema,
  createBusinessSchema,
  customerSchema,
  expenseIdSchema,
  expenseSchema,
  importExpensesSchema,
  importProductsSchema,
  importSalesHistorySchema,
  invoiceIdSchema,
  invoiceSchema,
  invoiceStatusSchema,
  paymentSchema,
  productSchema,
  quoteIdSchema,
  quoteSchema,
  quoteStatusSchema,
  saleSchema,
  stockAdjustSchema,
} from "./business.schemas";
import { z } from "zod";
import { askAssistant } from "./ai.server";
import {
  adjustStock,
  convertQuote,
  createBusinessRecord,
  createCustomer,
  createExpense,
  createInvoice,
  createProduct,
  createQuote,
  createSale,
  deleteExpense,
  getInvoiceDetail,
  getQuoteDetail,
  importExpenses,
  importProducts,
  importSalesHistory,
  listCustomers,
  listExpenses,
  listInvoices,
  listProducts,
  listQuotes,
  loadDashboard,
  loadReports,
  loadWorkspace,
  recordInvoicePayment,
  setInvoiceStatus,
  setQuoteStatus,
  type Db,
} from "./business.server";

export const getWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => loadWorkspace(context.supabase as Db, context.userId));

export const createBusiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createBusinessSchema.parse(data))
  .handler(async ({ data, context }) =>
    createBusinessRecord(context.supabase as Db, context.userId, data),
  );

export const getDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    businessIdSchema.extend({ days: z.coerce.number().int().min(1).max(365) }).parse(data),
  )
  .handler(async ({ data, context }) =>
    loadDashboard(context.supabase as Db, data.businessId, data.days),
  );

export const getReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    businessIdSchema.extend({ days: z.coerce.number().int().min(1).max(365) }).parse(data),
  )
  .handler(async ({ data, context }) =>
    loadReports(context.supabase as Db, data.businessId, data.days),
  );

export const getProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    businessIdSchema.extend({ search: z.string().max(80).default("") }).parse(data),
  )
  .handler(async ({ data, context }) =>
    listProducts(context.supabase as Db, data.businessId, data.search),
  );

export const addProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => productSchema.parse(data))
  .handler(async ({ data, context }) =>
    createProduct(context.supabase as Db, context.userId, data),
  );

export const updateStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => stockAdjustSchema.parse(data))
  .handler(async ({ data, context }) => adjustStock(context.supabase as Db, context.userId, data));

export const getCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    businessIdSchema.extend({ search: z.string().max(80).default("") }).parse(data),
  )
  .handler(async ({ data, context }) =>
    listCustomers(context.supabase as Db, data.businessId, data.search),
  );

export const addCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => customerSchema.parse(data))
  .handler(async ({ data, context }) =>
    createCustomer(context.supabase as Db, context.userId, data),
  );

/* ------------------------------- invoices ------------------------------- */

export const getInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    businessIdSchema.extend({ search: z.string().max(80).default("") }).parse(data),
  )
  .handler(async ({ data, context }) =>
    listInvoices(context.supabase as Db, data.businessId, data.search),
  );

export const getInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => invoiceIdSchema.parse(data))
  .handler(async ({ data, context }) =>
    getInvoiceDetail(context.supabase as Db, data.businessId, data.invoiceId),
  );

export const addInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => invoiceSchema.parse(data))
  .handler(async ({ data, context }) => createInvoice(context.supabase as Db, data));

export const updateInvoiceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => invoiceStatusSchema.parse(data))
  .handler(async ({ data, context }) => setInvoiceStatus(context.supabase as Db, data));

export const addPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => paymentSchema.parse(data))
  .handler(async ({ data, context }) => recordInvoicePayment(context.supabase as Db, data));

/* -------------------------------- quotes -------------------------------- */

export const getQuotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    businessIdSchema.extend({ search: z.string().max(80).default("") }).parse(data),
  )
  .handler(async ({ data, context }) =>
    listQuotes(context.supabase as Db, data.businessId, data.search),
  );

export const getQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => quoteIdSchema.parse(data))
  .handler(async ({ data, context }) =>
    getQuoteDetail(context.supabase as Db, data.businessId, data.quoteId),
  );

export const addQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => quoteSchema.parse(data))
  .handler(async ({ data, context }) => createQuote(context.supabase as Db, data));

export const updateQuoteStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => quoteStatusSchema.parse(data))
  .handler(async ({ data, context }) =>
    setQuoteStatus(context.supabase as Db, context.userId, data),
  );

export const convertQuoteToInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => convertQuoteSchema.parse(data))
  .handler(async ({ data, context }) => convertQuote(context.supabase as Db, data));

/* -------------------------------- expenses -------------------------------- */

export const getExpenses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    businessIdSchema
      .extend({ days: z.coerce.number().int().min(1).max(365).default(30) })
      .parse(data),
  )
  .handler(async ({ data, context }) =>
    listExpenses(context.supabase as Db, data.businessId, data.days),
  );

export const addExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => expenseSchema.parse(data))
  .handler(async ({ data, context }) =>
    createExpense(context.supabase as Db, context.userId, data),
  );

export const removeExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => expenseIdSchema.parse(data))
  .handler(async ({ data, context }) =>
    deleteExpense(context.supabase as Db, context.userId, data.businessId, data.expenseId),
  );

/* --------------------------------- sales --------------------------------- */

export const addSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => saleSchema.parse(data))
  .handler(async ({ data, context }) => createSale(context.supabase as Db, data));

/* -------------------------------- imports -------------------------------- */

export const importProductsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => importProductsSchema.parse(data))
  .handler(async ({ data, context }) =>
    importProducts(context.supabase as Db, context.userId, data),
  );

export const importExpensesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => importExpensesSchema.parse(data))
  .handler(async ({ data, context }) =>
    importExpenses(context.supabase as Db, context.userId, data),
  );

export const importSalesHistoryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => importSalesHistorySchema.parse(data))
  .handler(async ({ data, context }) =>
    importSalesHistory(context.supabase as Db, context.userId, data),
  );

/* ----------------------------- AI assistant ------------------------------ */

export const askAssistantFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => askAssistantSchema.parse(data))
  .handler(async ({ data, context }) =>
    askAssistant(context.supabase as Db, data.businessId, data.messages),
  );
