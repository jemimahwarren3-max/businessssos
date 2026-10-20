import { createServerFn } from "@tanstack/react-start";
import {
  askAssistantSchema,
  businessIdSchema,
  checkPaymentSchema,
  convertQuoteSchema,
  createBusinessSchema,
  createInviteSchema,
  createStaffAccountSchema,
  customerSchema,
  expenseIdSchema,
  expenseSchema,
  importCustomersSchema,
  importExpensesSchema,
  importProductsSchema,
  importSalesDetailedSchema,
  importSalesHistorySchema,
  inviteTokenSchema,
  listAuditLogsSchema,
  listNotificationsSchema,
  markAllNotificationsReadSchema,
  markNotificationReadSchema,
  notifyEmailSchema,
  invoiceIdSchema,
  invoiceSchema,
  invoiceStatusSchema,
  recurringInvoiceSchema,
  recurringInvoiceIdSchema,
  setRecurringInvoiceActiveSchema,
  paymentSchema,
  productSchema,
  purchaseOrderSchema,
  purchaseOrderStatusSchema,
  quickEntrySchema,
  quoteIdSchema,
  quoteSchema,
  quoteStatusSchema,
  removeTeamMemberSchema,
  resetStaffPasswordSchema,
  revokeInviteSchema,
  saleSchema,
  listSalesSchema,
  saleIdSchema,
  refundSaleSchema,
  setStaffPasswordSchema,
  staffLoginSchema,
  setRolePermissionSchema,
  commissionReportSchema,
  setCommissionRateSchema,
  addCashMovementSchema,
  closeCashSessionSchema,
  clockInSchema,
  openCashSessionSchema,
  timeEntriesReportSchema,
  adjustTimeEntrySchema,
  timeEntryIdSchema,
  verifyShopLoginSchema,
  stockAdjustSchema,
  subscriptionCheckoutSchema,
  supplierIdSchema,
  supplierSchema,
  updateSupplierSchema,
  updateTeamMemberRoleSchema,
  weeklyReportSchema,
} from "./business.schemas";
import { z } from "zod";
import { listAuditLogs } from "./audit.server";
import {
  adjustTimeEntry,
  clockIn,
  clockOut,
  deleteTimeEntry,
  getMyActiveShift,
  getMyRecentShifts,
  listTimeEntries,
} from "./time-tracking.server";
import {
  addCashMovement,
  closeCashSession,
  loadCashDrawer,
  openCashSession,
} from "./cash-drawer.server";
import {
  getNotifyEmail,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  setNotifyEmail,
} from "./notifications.server";
import { askAssistant } from "./ai.server";
import { parseQuickEntry } from "./quick-entry.server";
import { getAnomalies, getInventoryForecast, getWeeklyReport } from "./insights.server";
import { checkSubscriptionPayment, initiateSubscriptionCheckout } from "./payments/paynow.server";
import { exportBusinessData } from "./data-export.server";
import {
  acceptInvite,
  createInvite,
  createStaffAccount,
  getCommissionReport,
  getInvitePreview,
  getRolePermissions,
  setMemberCommissionRate,
  listPendingInvites,
  listPermissionCatalog,
  listTeamMembers,
  removeTeamMember,
  resetStaffPassword,
  revokeInvite,
  staffSignIn,
  setRolePermission,
  setStaffPassword,
  updateTeamMemberRole,
  verifyShopLogin,
} from "./team.server";
import { uploadProductImage } from "./product-media.server";
import { parseAndSanitize } from "./security";
import { authedRateLimit, ipRateLimit } from "./rate-limit.server";
import {
  adjustStock,
  convertQuote,
  createBusinessRecord,
  createCustomer,
  createExpense,
  createInvoice,
  createRecurringInvoice,
  deleteRecurringInvoice,
  listRecurringInvoices,
  setRecurringInvoiceActive,
  createProduct,
  createPurchaseOrder,
  setPurchaseOrderStatus,
  createQuote,
  createSale,
  getSaleDetail,
  listSales,
  refundSale,
  createSupplier,
  deleteExpense,
  deleteSupplier,
  getInvoiceDetail,
  getQuoteDetail,
  importCustomers,
  importExpenses,
  importProducts,
  importSalesDetailed,
  importSalesHistory,
  listCustomers,
  listExpenses,
  listInvoices,
  listLocations,
  listProducts,
  listPurchaseOrders,
  listQuotes,
  listSuppliers,
  loadBillingSummary,
  loadDashboard,
  loadReports,
  loadWorkspace,
  recordInvoicePayment,
  setInvoiceStatus,
  setQuoteStatus,
  updateSupplier,
  type Db,
} from "./business.server";

// `as const` is load-bearing: TanStack's middleware context inference
// pattern-matches on the array as a literal tuple type, and a plain
// `const x = [...]` widens to a general array, which silently breaks the
// context type for every handler composed with it (confirmed via isolated
// repro — the same composed middleware works fine inlined directly into
// `.middleware([...])` but not when first assigned to a const without this).
const authAndRateLimit = [
  authedRateLimit({ keyPrefix: "businessos-api", maxRequests: 120, windowSeconds: 60 }),
] as const;

// Tighter than the general API limit above — this initiates a real
// payment with Paynow, so it gets its own stricter cap on top.
const checkoutRateLimit = [
  authedRateLimit({ keyPrefix: "billing-checkout", maxRequests: 5, windowSeconds: 60 }),
] as const;

// A full-business data dump is the heaviest read in the app — its own
// stricter cap keeps it from being hammered.
const exportRateLimit = [
  authedRateLimit({ keyPrefix: "data-export", maxRequests: 3, windowSeconds: 60 }),
] as const;

// Every call here hits Groq — tighter than the general API limit, on top
// of the per-business daily cap enforced inside askAssistant/getWeeklyReport
// themselves (see ai.server.ts/insights.server.ts).
const aiRateLimit = [
  authedRateLimit({ keyPrefix: "ai-assistant", maxRequests: 20, windowSeconds: 60 }),
] as const;

// Each call does up to 500 sequential row inserts — its own cap keeps that
// from being triggered back-to-back.
const importRateLimit = [
  authedRateLimit({ keyPrefix: "csv-import", maxRequests: 10, windowSeconds: 60 }),
] as const;

// Also hits Groq — same tier as the assistant, on top of parseQuickEntry's
// own per-business daily cap (see quick-entry.server.ts).
const quickEntryRateLimit = [
  authedRateLimit({ keyPrefix: "quick-entry", maxRequests: 20, windowSeconds: 60 }),
] as const;

// Keyed by IP — the one team-related endpoint a not-yet-logged-in visitor
// can call, same reasoning as the auth endpoints in auth.functions.ts.
const invitePreviewLimit = [
  ipRateLimit({ keyPrefix: "invite-preview", maxRequests: 30, windowSeconds: 60 }),
] as const;

// Tighter than signInLimit (10/min) — businessName+staff name is a
// lower-entropy username than a full email, so sign-in gets its own cap.
const staffLoginLimit = [
  ipRateLimit({ keyPrefix: "staff-login", maxRequests: 8, windowSeconds: 60 }),
] as const;

export const getWorkspace = createServerFn({ method: "GET" })
  .middleware(authAndRateLimit)
  .handler(async ({ context }) => loadWorkspace(context.supabase as Db, context.userId));

export const createBusiness = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(createBusinessSchema, data))
  .handler(async ({ data, context }) =>
    createBusinessRecord(context.supabase as Db, context.userId, data),
  );

export const getDashboard = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) =>
    parseAndSanitize(
      businessIdSchema.extend({ days: z.coerce.number().int().min(1).max(365) }),
      data,
    ),
  )
  .handler(async ({ data, context }) =>
    loadDashboard(context.supabase as Db, data.businessId, data.days),
  );

export const getReports = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) =>
    parseAndSanitize(
      businessIdSchema.extend({ days: z.coerce.number().int().min(1).max(365) }),
      data,
    ),
  )
  .handler(async ({ data, context }) =>
    loadReports(context.supabase as Db, data.businessId, data.days),
  );

export const getLocations = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(businessIdSchema, data))
  .handler(async ({ data, context }) => listLocations(context.supabase as Db, data.businessId));

export const getProducts = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) =>
    parseAndSanitize(
      businessIdSchema.extend({
        search: z.string().max(80).default(""),
        supplierId: z.string().uuid().optional(),
      }),
      data,
    ),
  )
  .handler(async ({ data, context }) =>
    listProducts(context.supabase as Db, data.businessId, data.search, data.supplierId),
  );

export const addProduct = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(productSchema, data))
  .handler(async ({ data, context }) => createProduct(context.supabase as Db, data));

function parseProductPhotoForm(data: unknown): {
  businessId: string;
  productId: string;
  file: File;
} {
  if (!(data instanceof FormData)) {
    throw new Error("Choose a photo.");
  }
  const businessId = String(data.get("businessId") ?? "");
  const productId = String(data.get("productId") ?? "");
  const file = data.get("file");
  if (!/^[0-9a-f-]{36}$/i.test(businessId) || !/^[0-9a-f-]{36}$/i.test(productId)) {
    throw new Error("That product could not be found.");
  }
  if (!(file instanceof File)) {
    throw new Error("Choose a photo.");
  }
  return { businessId, productId, file };
}

export const uploadProductImageFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseProductPhotoForm(data))
  .handler(async ({ data, context }) =>
    uploadProductImage(context.supabase as Db, data.businessId, data.productId, data.file),
  );

export const updateStock = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(stockAdjustSchema, data))
  .handler(async ({ data, context }) => adjustStock(context.supabase as Db, data));

export const getCustomers = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) =>
    parseAndSanitize(businessIdSchema.extend({ search: z.string().max(80).default("") }), data),
  )
  .handler(async ({ data, context }) =>
    listCustomers(context.supabase as Db, data.businessId, data.search),
  );

export const addCustomer = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(customerSchema, data))
  .handler(async ({ data, context }) =>
    createCustomer(context.supabase as Db, context.userId, data),
  );

/* ------------------------------- suppliers ------------------------------- */

export const getSuppliers = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) =>
    parseAndSanitize(businessIdSchema.extend({ search: z.string().max(80).default("") }), data),
  )
  .handler(async ({ data, context }) =>
    listSuppliers(context.supabase as Db, data.businessId, data.search),
  );

export const addSupplier = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(supplierSchema, data))
  .handler(async ({ data, context }) =>
    createSupplier(context.supabase as Db, context.userId, data),
  );

export const updateSupplierFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(updateSupplierSchema, data))
  .handler(async ({ data, context }) =>
    updateSupplier(context.supabase as Db, context.userId, data),
  );

export const deleteSupplierFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(supplierIdSchema, data))
  .handler(async ({ data, context }) =>
    deleteSupplier(context.supabase as Db, context.userId, data.businessId, data.supplierId),
  );

/* ------------------------------- invoices ------------------------------- */

export const getInvoices = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) =>
    parseAndSanitize(businessIdSchema.extend({ search: z.string().max(80).default("") }), data),
  )
  .handler(async ({ data, context }) =>
    listInvoices(context.supabase as Db, data.businessId, data.search),
  );

export const getInvoice = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(invoiceIdSchema, data))
  .handler(async ({ data, context }) =>
    getInvoiceDetail(context.supabase as Db, data.businessId, data.invoiceId),
  );

export const addInvoice = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(invoiceSchema, data))
  .handler(async ({ data, context }) => createInvoice(context.supabase as Db, data));

export const getRecurringInvoices = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(businessIdSchema, data))
  .handler(async ({ data, context }) =>
    listRecurringInvoices(context.supabase as Db, data.businessId),
  );

export const addRecurringInvoice = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(recurringInvoiceSchema, data))
  .handler(async ({ data, context }) => createRecurringInvoice(context.supabase as Db, data));

export const updateRecurringInvoiceActive = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(setRecurringInvoiceActiveSchema, data))
  .handler(async ({ data, context }) =>
    setRecurringInvoiceActive(
      context.supabase as Db,
      data.businessId,
      data.recurringInvoiceId,
      data.active,
    ),
  );

export const removeRecurringInvoice = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(recurringInvoiceIdSchema, data))
  .handler(async ({ data, context }) =>
    deleteRecurringInvoice(context.supabase as Db, data.businessId, data.recurringInvoiceId),
  );

export const updateInvoiceStatus = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(invoiceStatusSchema, data))
  .handler(async ({ data, context }) => setInvoiceStatus(context.supabase as Db, data));

export const addPayment = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(paymentSchema, data))
  .handler(async ({ data, context }) => recordInvoicePayment(context.supabase as Db, data));

/* -------------------------------- quotes -------------------------------- */

export const getQuotes = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) =>
    parseAndSanitize(businessIdSchema.extend({ search: z.string().max(80).default("") }), data),
  )
  .handler(async ({ data, context }) =>
    listQuotes(context.supabase as Db, data.businessId, data.search),
  );

export const getQuote = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(quoteIdSchema, data))
  .handler(async ({ data, context }) =>
    getQuoteDetail(context.supabase as Db, data.businessId, data.quoteId),
  );

export const addQuote = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(quoteSchema, data))
  .handler(async ({ data, context }) => createQuote(context.supabase as Db, data));

export const updateQuoteStatus = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(quoteStatusSchema, data))
  .handler(async ({ data, context }) =>
    setQuoteStatus(context.supabase as Db, context.userId, data),
  );

export const convertQuoteToInvoice = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(convertQuoteSchema, data))
  .handler(async ({ data, context }) => convertQuote(context.supabase as Db, data));

/* --------------------------- purchase orders --------------------------- */

export const getPurchaseOrders = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(businessIdSchema, data))
  .handler(async ({ data, context }) =>
    listPurchaseOrders(context.supabase as Db, data.businessId),
  );

export const addPurchaseOrder = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(purchaseOrderSchema, data))
  .handler(async ({ data, context }) => createPurchaseOrder(context.supabase as Db, data));

export const updatePurchaseOrderStatus = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(purchaseOrderStatusSchema, data))
  .handler(async ({ data, context }) => setPurchaseOrderStatus(context.supabase as Db, data));

/* -------------------------------- expenses -------------------------------- */

export const getExpenses = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) =>
    parseAndSanitize(
      businessIdSchema.extend({ days: z.coerce.number().int().min(1).max(365).default(30) }),
      data,
    ),
  )
  .handler(async ({ data, context }) =>
    listExpenses(context.supabase as Db, data.businessId, data.days),
  );

export const addExpense = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(expenseSchema, data))
  .handler(async ({ data, context }) =>
    createExpense(context.supabase as Db, context.userId, data),
  );

export const removeExpense = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(expenseIdSchema, data))
  .handler(async ({ data, context }) =>
    deleteExpense(context.supabase as Db, context.userId, data.businessId, data.expenseId),
  );

/* --------------------------------- sales --------------------------------- */

export const addSale = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(saleSchema, data))
  .handler(async ({ data, context }) => createSale(context.supabase as Db, data));

export const getSales = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(listSalesSchema, data))
  .handler(async ({ data, context }) =>
    listSales(context.supabase as Db, data.businessId, data.search),
  );

export const getSale = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(saleIdSchema, data))
  .handler(async ({ data, context }) =>
    getSaleDetail(context.supabase as Db, data.businessId, data.saleId),
  );

export const refundSaleFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(refundSaleSchema, data))
  .handler(async ({ data, context }) => refundSale(context.supabase as Db, data));

/* -------------------------------- imports -------------------------------- */

export const importProductsFn = createServerFn({ method: "POST" })
  .middleware([...authAndRateLimit, ...importRateLimit])
  .inputValidator((data: unknown) => parseAndSanitize(importProductsSchema, data))
  .handler(async ({ data, context }) =>
    importProducts(context.supabase as Db, context.userId, data),
  );

export const importExpensesFn = createServerFn({ method: "POST" })
  .middleware([...authAndRateLimit, ...importRateLimit])
  .inputValidator((data: unknown) => parseAndSanitize(importExpensesSchema, data))
  .handler(async ({ data, context }) =>
    importExpenses(context.supabase as Db, context.userId, data),
  );

export const importSalesHistoryFn = createServerFn({ method: "POST" })
  .middleware([...authAndRateLimit, ...importRateLimit])
  .inputValidator((data: unknown) => parseAndSanitize(importSalesHistorySchema, data))
  .handler(async ({ data, context }) =>
    importSalesHistory(context.supabase as Db, context.userId, data),
  );

export const importCustomersFn = createServerFn({ method: "POST" })
  .middleware([...authAndRateLimit, ...importRateLimit])
  .inputValidator((data: unknown) => parseAndSanitize(importCustomersSchema, data))
  .handler(async ({ data, context }) =>
    importCustomers(context.supabase as Db, context.userId, data),
  );

export const importSalesDetailedFn = createServerFn({ method: "POST" })
  .middleware([...authAndRateLimit, ...importRateLimit])
  .inputValidator((data: unknown) => parseAndSanitize(importSalesDetailedSchema, data))
  .handler(async ({ data, context }) =>
    importSalesDetailed(context.supabase as Db, context.userId, data),
  );

/* -------------------------------- billing -------------------------------- */

export const getBilling = createServerFn({ method: "GET" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(businessIdSchema, data))
  .handler(async ({ data, context }) =>
    loadBillingSummary(context.supabase as Db, data.businessId),
  );

export const startSubscriptionCheckout = createServerFn({ method: "POST" })
  .middleware([...authAndRateLimit, ...checkoutRateLimit])
  .inputValidator((data: unknown) => parseAndSanitize(subscriptionCheckoutSchema, data))
  .handler(async ({ data, context }) => {
    const email = (context.claims as { email?: string }).email;
    if (!email) throw new Error("Your account has no email on file, please contact support.");
    return initiateSubscriptionCheckout(context.supabase as Db, data, email);
  });

export const checkSubscriptionPaymentFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(checkPaymentSchema, data))
  .handler(async ({ data, context }) =>
    checkSubscriptionPayment(context.supabase as Db, data.businessId, data.reference),
  );

/* ------------------------------ data export ------------------------------ */

export const exportBusinessDataFn = createServerFn({ method: "POST" })
  .middleware([...authAndRateLimit, ...exportRateLimit])
  .inputValidator((data: unknown) => parseAndSanitize(businessIdSchema, data))
  .handler(async ({ data, context }) =>
    exportBusinessData(context.supabase as Db, context.userId, data.businessId),
  );

/* ----------------------------- AI assistant ------------------------------ */

export const askAssistantFn = createServerFn({ method: "POST" })
  .middleware([...authAndRateLimit, ...aiRateLimit])
  .inputValidator((data: unknown) => parseAndSanitize(askAssistantSchema, data))
  .handler(async ({ data, context }) =>
    askAssistant(context.supabase as Db, data.businessId, data.messages),
  );

/* -------------------------------- quick add -------------------------------- */

export const parseQuickEntryFn = createServerFn({ method: "POST" })
  .middleware([...authAndRateLimit, ...quickEntryRateLimit])
  .inputValidator((data: unknown) => parseAndSanitize(quickEntrySchema, data))
  .handler(async ({ data, context }) =>
    parseQuickEntry(context.supabase as Db, data.businessId, data.text),
  );

/* -------------------------------- insights -------------------------------- */

export const getInsightsFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(businessIdSchema, data))
  .handler(async ({ data, context }) => {
    const [forecast, anomalies] = await Promise.all([
      getInventoryForecast(context.supabase as Db, data.businessId),
      getAnomalies(context.supabase as Db, data.businessId),
    ]);
    return { forecast, anomalies };
  });

export const getWeeklyReportFn = createServerFn({ method: "POST" })
  .middleware([...authAndRateLimit, ...aiRateLimit])
  .inputValidator((data: unknown) => parseAndSanitize(weeklyReportSchema, data))
  .handler(async ({ data, context }) =>
    getWeeklyReport(context.supabase as Db, data.businessId, data.forceRegenerate ?? false),
  );

/* ---------------------------------- team ----------------------------------- */

export const getTeamMembersFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(businessIdSchema, data))
  .handler(async ({ data, context }) => listTeamMembers(context.supabase as Db, data.businessId));

export const getPendingInvitesFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(businessIdSchema, data))
  .handler(async ({ data, context }) =>
    listPendingInvites(context.supabase as Db, data.businessId),
  );

export const createInviteFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(createInviteSchema, data))
  .handler(async ({ data, context }) =>
    createInvite(context.supabase as Db, context.userId, data.businessId, data.role),
  );

export const revokeInviteFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(revokeInviteSchema, data))
  .handler(async ({ data, context }) =>
    revokeInvite(context.supabase as Db, context.userId, data.businessId, data.inviteId),
  );

export const updateTeamMemberRoleFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(updateTeamMemberRoleSchema, data))
  .handler(async ({ data, context }) =>
    updateTeamMemberRole(
      context.supabase as Db,
      context.userId,
      data.businessId,
      data.memberUserId,
      data.role,
    ),
  );

export const removeTeamMemberFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(removeTeamMemberSchema, data))
  .handler(async ({ data, context }) =>
    removeTeamMember(context.supabase as Db, context.userId, data.businessId, data.memberUserId),
  );

export const getInvitePreviewFn = createServerFn({ method: "POST" })
  .middleware(invitePreviewLimit)
  .inputValidator((data: unknown) => parseAndSanitize(inviteTokenSchema, data))
  .handler(async ({ data }) => getInvitePreview(data.token));

export const acceptInviteFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(inviteTokenSchema, data))
  .handler(async ({ data, context }) => acceptInvite(context.supabase as Db, data.token));

export const createStaffAccountFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(createStaffAccountSchema, data))
  .handler(async ({ data, context }) =>
    createStaffAccount(
      context.supabase as Db,
      data.businessId,
      context.userId,
      data.displayName,
      data.password,
      data.role,
    ),
  );

export const resetStaffPasswordFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(resetStaffPasswordSchema, data))
  .handler(async ({ data, context }) =>
    resetStaffPassword(
      context.supabase as Db,
      data.businessId,
      context.userId,
      data.memberUserId,
      data.newPassword,
    ),
  );

export const staffSignInFn = createServerFn({ method: "POST" })
  .middleware(staffLoginLimit)
  .inputValidator((data: unknown) => parseAndSanitize(staffLoginSchema, data))
  .handler(async ({ data }) => staffSignIn(data.businessName, data.name, data.password));

export const setStaffPasswordFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(setStaffPasswordSchema, data))
  .handler(async ({ data, context }) =>
    setStaffPassword(context.supabase as Db, data.businessId, context.userId, data.password),
  );

export const verifyShopLoginFn = createServerFn({ method: "POST" })
  .middleware(staffLoginLimit)
  .inputValidator((data: unknown) => parseAndSanitize(verifyShopLoginSchema, data))
  .handler(async ({ data }) => verifyShopLogin(data.businessName, data.password));

export const getPermissionCatalogFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .handler(async ({ context }) => listPermissionCatalog(context.supabase as Db));

export const getRolePermissionsFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(businessIdSchema, data))
  .handler(async ({ data, context }) =>
    getRolePermissions(context.supabase as Db, data.businessId),
  );

export const setRolePermissionFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(setRolePermissionSchema, data))
  .handler(async ({ data, context }) =>
    setRolePermission(
      context.supabase as Db,
      data.businessId,
      context.userId,
      data.role,
      data.permissionKey,
      data.granted,
    ),
  );

export const getCommissionReportFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(commissionReportSchema, data))
  .handler(async ({ data, context }) =>
    getCommissionReport(context.supabase as Db, data.businessId, data.days),
  );

export const setCommissionRateFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(setCommissionRateSchema, data))
  .handler(async ({ data, context }) =>
    setMemberCommissionRate(context.supabase as Db, data.businessId, data.memberUserId, data.rate),
  );

export const getCashDrawerFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(businessIdSchema, data))
  .handler(async ({ data, context }) => loadCashDrawer(context.supabase as Db, data.businessId));

export const openCashSessionFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(openCashSessionSchema, data))
  .handler(async ({ data, context }) =>
    openCashSession(context.supabase as Db, data.businessId, data.openingFloat, data.note ?? ""),
  );

export const closeCashSessionFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(closeCashSessionSchema, data))
  .handler(async ({ data, context }) =>
    closeCashSession(context.supabase as Db, data.businessId, data.countedCash, data.note ?? ""),
  );

export const addCashMovementFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(addCashMovementSchema, data))
  .handler(async ({ data, context }) =>
    addCashMovement(context.supabase as Db, data.businessId, data.kind, data.amount, data.note),
  );

export const getMyActiveShiftFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(businessIdSchema, data))
  .handler(async ({ data, context }) =>
    getMyActiveShift(context.supabase as Db, data.businessId, context.userId),
  );

export const clockInFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(clockInSchema, data))
  .handler(async ({ data, context }) =>
    clockIn(context.supabase as Db, data.businessId, data.note ?? ""),
  );

export const clockOutFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(businessIdSchema, data))
  .handler(async ({ data, context }) => clockOut(context.supabase as Db, data.businessId));

export const getMyRecentShiftsFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(businessIdSchema, data))
  .handler(async ({ data, context }) =>
    getMyRecentShifts(context.supabase as Db, data.businessId, context.userId),
  );

export const getTimeEntriesFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(timeEntriesReportSchema, data))
  .handler(async ({ data, context }) =>
    listTimeEntries(context.supabase as Db, data.businessId, data.days),
  );

export const adjustTimeEntryFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(adjustTimeEntrySchema, data))
  .handler(async ({ data, context }) =>
    adjustTimeEntry(
      context.supabase as Db,
      data.businessId,
      data.entryId,
      data.clockIn,
      data.clockOut,
    ),
  );

export const deleteTimeEntryFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(timeEntryIdSchema, data))
  .handler(async ({ data, context }) =>
    deleteTimeEntry(context.supabase as Db, data.businessId, data.entryId),
  );

export const getAuditLogsFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(listAuditLogsSchema, data))
  .handler(async ({ data, context }) =>
    listAuditLogs(context.supabase as Db, data.businessId, data.offset),
  );

export const getNotificationsFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(listNotificationsSchema, data))
  .handler(async ({ data, context }) =>
    listNotifications(context.supabase as Db, data.businessId, data.offset ?? 0),
  );

export const markNotificationReadFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(markNotificationReadSchema, data))
  .handler(async ({ data, context }) =>
    markNotificationRead(context.supabase as Db, data.notificationId),
  );

export const markAllNotificationsReadFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(markAllNotificationsReadSchema, data))
  .handler(async ({ data, context }) =>
    markAllNotificationsRead(context.supabase as Db, data.businessId),
  );

export const getNotifyEmailFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) =>
    parseAndSanitize(z.object({ businessId: z.string().uuid() }), data),
  )
  .handler(async ({ data, context }) => getNotifyEmail(context.supabase as Db, data.businessId));

export const setNotifyEmailFn = createServerFn({ method: "POST" })
  .middleware(authAndRateLimit)
  .inputValidator((data: unknown) => parseAndSanitize(notifyEmailSchema, data))
  .handler(async ({ data, context }) =>
    setNotifyEmail(context.supabase as Db, data.businessId, data.enabled),
  );
