import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";
import { createAnonClient, tryGetAuthedContext } from "@/lib/auth/session.server";
import { flushNotificationOutboxForBusiness } from "@/lib/notifications.mail.server";
import {
  initiateShopPaynow,
  refreshShopPaynowForOrder,
  shopOrderId,
  shopPaynowConnected,
} from "@/lib/payments/shop-paynow.server";
import {
  decodeProofBase64,
  signedPaymentProofUrl,
  storePaymentProofFile,
} from "@/lib/storefront/payment-proof.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  AppError,
  assertCanPublish,
  assertCanWrite,
  assertPermission,
  dbFail,
  type Db,
} from "@/lib/business.server";
import { attributeStoreOrderAnalytics } from "@/lib/growth.server";
import {
  adminOrderSchema,
  adminStoreSchema,
  checkoutResultSchema,
  customerOrderSchema,
  adminReviewListSchema,
  complaintListSchema,
  complaintResultSchema,
  listingReportListSchema,
  marketplaceListingSchema,
  marketplaceSchema,
  productReviewsSchema,
  publicStoreSchema,
  quoteSchema,
  shopperAccountSchema,
  type AdminOrder,
  type AdminReviewItem,
  type AdminStore,
  type CartQuote,
  type CustomerOrder,
  type ListingReportItem,
  type Marketplace,
  type ComplaintItem,
  type MarketplaceListing,
  type ProductReviews,
  type PublicStore,
  type ShopperAccount,
} from "./contract";

async function storefrontClient() {
  const ctx = await tryGetAuthedContext();
  return ctx?.supabase ?? createAnonClient();
}

async function untypedRpc(
  client: { rpc: (...args: never[]) => unknown },
  fn: string,
  args: Record<string, unknown>,
): Promise<{ data: Json | null; error: { message?: string } | null }> {
  return (await (
    client.rpc as (
      name: string,
      params: Record<string, unknown>,
    ) => Promise<{
      data: Json | null;
      error: { message?: string } | null;
    }>
  )(fn, args)) as { data: Json | null; error: { message?: string } | null };
}

function rpcFail(context: string, error: unknown): never {
  const message = (error as { message?: string } | null)?.message ?? "";
  if (message.includes("schema cache") || message.includes("Could not find the function")) {
    console.error(`[businessos] ${context}`, error);
    throw new AppError(
      "The online shop database update has not been applied yet. Apply the latest Supabase migration, then try again.",
    );
  }
  dbFail(context, error);
}

async function parseRpc<T>(
  context: string,
  result: { data: Json | null; error: { message?: string } | null },
  schema: { safeParse: (data: unknown) => z.SafeParseReturnType<unknown, T> },
): Promise<T> {
  if (result.error) rpcFail(context, result.error);
  const parsed = schema.safeParse(result.data);
  if (!parsed.success) {
    console.error(`[businessos] ${context} payload`, parsed.error.flatten());
    throw new AppError("The shop data could not be read. Please try again.");
  }
  return parsed.data;
}

export async function loadPublicStore(input: {
  slug: string;
  query?: string | undefined;
  category?: string | undefined;
  sort?: string | undefined;
}): Promise<PublicStore | null> {
  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("get_public_store", {
    _slug: input.slug,
    _query: input.query ?? "",
    _category: input.category ?? "",
    _sort: input.sort ?? "featured",
    _limit: 48,
    _offset: 0,
  });
  if (error) rpcFail("load public store", error);
  if (data == null) return null;
  const store = await parseRpc("load public store", { data, error: null }, publicStoreSchema);
  const offered = await supabase.rpc("shop_offers_paynow", { _slug: input.slug });
  if (offered.error) rpcFail("check public shop Paynow availability", offered.error);
  store.payments.paynow = offered.data === true;
  return store;
}

export async function loadStorePreview(supabase: Db, slug: string): Promise<PublicStore | null> {
  const { data, error } = await supabase.rpc("get_store_preview", { _slug: slug });
  if (error) rpcFail("preview store", error);
  if (data == null) return null;
  const store = await parseRpc("preview store", { data, error: null }, publicStoreSchema);
  const offered = await supabase.rpc("shop_offers_paynow", { _slug: slug });
  if (offered.error) rpcFail("check preview shop Paynow availability", offered.error);
  store.payments.paynow = offered.data === true;
  return store;
}

export async function quoteCart(
  slug: string,
  items: { productId: string; quantity: number; note?: string | undefined }[],
  fulfilment: string,
): Promise<CartQuote> {
  const supabase = createAnonClient();
  const result = await supabase.rpc("quote_store_cart", {
    _slug: slug,
    _items: items as unknown as Json,
    _fulfilment: fulfilment,
  });
  return parseRpc("quote cart", result, quoteSchema);
}

export async function placeOrder(input: {
  slug: string;
  campaignId?: string | undefined;
  analyticsVisitorId?: string | undefined;
  idempotencyKey: string;
  customer: {
    name: string;
    phone: string;
    email?: string | undefined;
    address?: string | undefined;
    notes?: string | undefined;
    messagesConsent?: boolean | undefined;
  };
  items: { productId: string; quantity: number; note?: string | undefined }[];
  fulfilment: string;
  paymentMethod: string;
  collectAt?: string | undefined;
  paynowChannel?: "web" | "ecocash" | undefined;
  manualMethodId?: string | undefined;
}) {
  const supabase = await storefrontClient();
  const result = await supabase.rpc("create_store_order", {
    _slug: input.slug,
    _idempotency_key: input.idempotencyKey,
    _customer: {
      ...input.customer,
      ...(input.manualMethodId ? { manualMethodId: input.manualMethodId } : {}),
    } as unknown as Json,
    _items: input.items as unknown as Json,
    _fulfilment: input.fulfilment,
    _payment_method: input.paymentMethod,
    _collect_at: input.collectAt ?? null,
  });
  const parsed = await parseRpc("create store order", result, checkoutResultSchema);
  if (parsed.orderId && input.analyticsVisitorId) {
    await attributeStoreOrderAnalytics(parsed.orderId, input.analyticsVisitorId, input.campaignId);
  }
  if (parsed.paymentMethod === "paynow" && parsed.orderId && input.customer.email) {
    try {
      const paynow = await initiateShopPaynow({
        slug: input.slug,
        orderId: parsed.orderId,
        reference: parsed.reference,
        email: input.customer.email,
        phone: input.customer.phone,
        channel: input.paynowChannel ?? "web",
        amount: parsed.total,
        currency: parsed.currency,
      });
      return { ...parsed, paynow };
    } catch (error) {
      console.error("[businessos] shop Paynow after order", error);
      return { ...parsed, paynow: null };
    }
  }
  return parsed;
}

export async function startCustomerPaynow(input: {
  slug: string;
  reference: string;
  token: string;
  channel: "web" | "ecocash";
  phone?: string;
}) {
  const order = await loadCustomerOrder(input.slug, input.reference, input.token);
  if (order.paymentMethod !== "paynow") {
    throw new AppError("This order is not a Paynow checkout.");
  }
  if (order.paid) {
    throw new AppError("This order is already paid.");
  }
  if (!order.customerEmail) {
    throw new AppError("This order has no email for Paynow.");
  }
  const orderId = await shopOrderId(input.slug, input.reference);
  if (!orderId) {
    throw new AppError("That order could not be found.");
  }
  return initiateShopPaynow({
    slug: input.slug,
    orderId,
    reference: order.reference,
    email: order.customerEmail,
    phone: input.phone ?? order.customerPhone,
    channel: input.channel,
    amount: order.total,
    currency: order.currency,
  });
}

export async function loadCustomerOrder(
  slug: string,
  reference: string,
  token: string,
): Promise<CustomerOrder> {
  const supabase = await storefrontClient();
  const result = await supabase.rpc("get_store_order", {
    _slug: slug,
    _reference: reference,
    _token: token,
  });
  let order = await parseRpc("load store order", result, customerOrderSchema);
  if (order.paymentMethod === "paynow" && !order.paid) {
    const orderId = await shopOrderId(slug, reference);
    if (orderId) {
      try {
        await refreshShopPaynowForOrder(orderId);
      } catch (error) {
        console.error("[businessos] refresh shop Paynow", error);
      }
      const again = await supabase.rpc("get_store_order", {
        _slug: slug,
        _reference: reference,
        _token: token,
      });
      order = await parseRpc("reload store order", again, customerOrderSchema);
    }
  }
  return withProofUrl(order);
}

async function withProofUrl<T extends object>(order: T): Promise<T> {
  const terms =
    "terms" in order
      ? (order as { terms?: { paymentProof?: { storagePath?: string | null } } }).terms
      : undefined;
  return { ...order, proofUrl: await signedPaymentProofUrl(terms?.paymentProof?.storagePath) };
}

async function withShopPaynowFlag(admin: AdminStore, businessId: string): Promise<AdminStore> {
  if (admin.store) {
    const connected = await shopPaynowConnected(businessId);
    const { data: available, error } = await supabaseAdmin.rpc("shop_offers_paynow_business", {
      _business_id: businessId,
    });
    if (error) dbFail("shop Paynow availability", error);
    admin.store.payments.paynow = connected;
    admin.store.payments.paynowAvailable = available;
    admin.store.payments.acceptPaynow = admin.store.payments.acceptPaynow || false;
  }
  return admin;
}

export async function loadAdminStore(supabase: Db, businessId: string): Promise<AdminStore> {
  const result = await supabase.rpc("get_storefront_admin", { _business_id: businessId });
  return withShopPaynowFlag(
    await parseRpc("load storefront", result, adminStoreSchema),
    businessId,
  );
}

export async function saveStorefront(supabase: Db, businessId: string, patch: Json) {
  await assertCanWrite(supabase, businessId);
  await assertPermission(supabase, businessId, "business.settings");
  const result = await supabase.rpc("save_storefront", {
    _business_id: businessId,
    _patch: patch,
  });
  return withShopPaynowFlag(
    await parseRpc("save storefront", result, adminStoreSchema),
    businessId,
  );
}

export async function loadStoreLaunchEligibility(supabase: Db, businessId: string) {
  await assertPermission(supabase, businessId, "business.settings");
  const result = await supabase.rpc("get_store_launch_eligibility" as never, {
    _business_id: businessId,
  } as never);
  const { storeLaunchEligibilitySchema } = await import("./launch-eligibility");
  return parseRpc("load store launch eligibility", result, storeLaunchEligibilitySchema);
}

export async function publishStorefront(supabase: Db, businessId: string, published: boolean) {
  await assertPermission(supabase, businessId, "business.settings");
  if (published) {
    await assertCanPublish(supabase, businessId);
    const { data: flags, error: flagError } = await supabase.rpc(
      "get_business_feature_flags" as never,
      { _business_id: businessId } as never,
    );
    if (flagError) dbFail("check shop feature flags", flagError);
    const onlineShopEnabled =
      !flags ||
      typeof flags !== "object" ||
      Array.isArray(flags) ||
      (flags as { onlineShopEnabled?: boolean }).onlineShopEnabled !== false;
    if (!onlineShopEnabled) {
      throw new AppError("Online shop is disabled for this business. Contact Kwetuu support.");
    }
  }
  const result = await supabase.rpc("set_storefront_published", {
    _business_id: businessId,
    _published: published,
  });
  return withShopPaynowFlag(
    await parseRpc("publish storefront", result, adminStoreSchema),
    businessId,
  );
}

export async function saveListing(
  supabase: Db,
  input: {
    businessId: string;
    productId: string;
    published: boolean;
    publicName: string | null;
    details: string;
    sizeGuide: string;
    minQty: number;
    maxQty: number | null;
    featured: boolean;
  },
) {
  await assertCanWrite(supabase, input.businessId);
  await assertPermission(supabase, input.businessId, "business.settings");
  const { error } = await supabase.rpc(
    "set_product_listing_details" as never,
    {
      _business_id: input.businessId,
      _product_id: input.productId,
      _published: input.published,
      _details: input.details,
      _size_guide: input.sizeGuide,
      _min_qty: input.minQty,
      _max_qty: input.maxQty,
      _featured: input.featured,
      _public_name: input.publicName,
    } as never,
  );
  if (error) rpcFail("save listing", error);
}

export async function setProductCategory(
  supabase: Db,
  input: { businessId: string; productId: string; categoryId: string | null },
) {
  await assertCanWrite(supabase, input.businessId);
  await assertPermission(supabase, input.businessId, "business.settings");
  const { error } = await supabase.rpc(
    "set_product_category" as never,
    {
      _business_id: input.businessId,
      _product_id: input.productId,
      _category_id: input.categoryId,
    } as never,
  );
  if (error) rpcFail("set product category", error);
}

export async function loadAdminOrder(
  supabase: Db,
  businessId: string,
  orderId: string,
): Promise<AdminOrder> {
  try {
    await refreshShopPaynowForOrder(orderId);
  } catch (error) {
    console.error("[businessos] merchant refresh shop Paynow", error);
  }
  const result = await supabase.rpc("get_store_order_admin", {
    _business_id: businessId,
    _order_id: orderId,
  });
  return withProofUrl(await parseRpc("load online order", result, adminOrderSchema));
}

export async function transitionOrder(
  supabase: Db,
  businessId: string,
  orderId: string,
  action: string,
  reason?: string,
  paymentReference?: string,
) {
  await assertCanWrite(supabase, businessId);
  if (action === "reject_proof") {
    const result = await supabase.rpc("reject_store_order_proof", {
      _business_id: businessId,
      _order_id: orderId,
      _reason: reason ?? "",
    });
    return withProofUrl(await parseRpc("reject payment note", result, adminOrderSchema));
  }
  const result =
    action === "mark_paid"
      ? await supabase.rpc("record_store_order_payment", {
          _business_id: businessId,
          _order_id: orderId,
          _confirmation_reference: paymentReference ?? "",
        })
      : await supabase.rpc("transition_store_order", {
          _business_id: businessId,
          _order_id: orderId,
          _action: action,
        });
  const parsed = withProofUrl(await parseRpc("update online order", result, adminOrderSchema));
  await flushNotificationOutboxForBusiness(supabase, businessId);
  return parsed;
}

export async function submitOrderPaymentNote(input: {
  slug: string;
  reference: string;
  token: string;
  proofReference?: string | undefined;
  proofNote?: string | undefined;
  proofBase64?: string | undefined;
}): Promise<CustomerOrder> {
  await loadCustomerOrder(input.slug, input.reference, input.token);
  let storagePath = "";
  if (input.proofBase64) {
    const proofBytes = decodeProofBase64(input.proofBase64);
    const orderId = await shopOrderId(input.slug, input.reference);
    if (!orderId) throw new AppError("That order could not be found.");
    const orders = supabaseAdmin as unknown as {
      from: (name: string) => {
        select: (cols: string) => {
          eq: (
            col: string,
            val: string,
          ) => {
            maybeSingle: () => Promise<{
              data: { id: string; business_id: string } | null;
              error: { message?: string } | null;
            }>;
          };
        };
      };
    };
    const { data: row, error } = await orders
      .from("store_orders")
      .select("id, business_id")
      .eq("id", orderId)
      .maybeSingle();
    if (error || !row) throw new AppError("That order could not be found.");
    const stored = await storePaymentProofFile({
      businessId: row.business_id,
      orderId: row.id,
      bytes: proofBytes,
    });
    storagePath = stored.storagePath;
  }
  const supabase = await storefrontClient();
  const result = await supabase.rpc("submit_store_order_proof", {
    _slug: input.slug,
    _reference: input.reference,
    _token: input.token,
    _proof_reference: input.proofReference ?? "",
    _proof_note: input.proofNote ?? "",
    _storage_path: storagePath,
  });
  return withProofUrl(await parseRpc("submit payment note", result, customerOrderSchema));
}

const MARKETPLACE_PAGE_SIZE = 24;

export async function loadMarketplace(input: {
  query?: string | undefined;
  category?: string | undefined;
  offset?: number | undefined;
}): Promise<Marketplace> {
  const offset = Math.max(0, Math.min(input.offset ?? 0, 2000));
  const supabase = createAnonClient();
  const result = await supabase.rpc("browse_marketplace", {
    _query: input.query ?? "",
    _category: input.category ?? "",
    _limit: MARKETPLACE_PAGE_SIZE,
    _offset: offset,
  });
  const market = await parseRpc("browse marketplace", result, marketplaceSchema);
  const filtering = Boolean(market.query || market.category);
  const productCount = filtering ? market.products.length : market.products.length;
  return {
    ...market,
    offset,
    hasMore: filtering && productCount >= MARKETPLACE_PAGE_SIZE,
  };
}

export async function loadMarketplaceListing(
  supabase: Db,
  businessId: string,
): Promise<MarketplaceListing> {
  const result = await supabase.rpc("get_marketplace_listing", { _business_id: businessId });
  return parseRpc("marketplace listing", result, marketplaceListingSchema);
}

export async function setMarketplaceVisible(
  supabase: Db,
  businessId: string,
  listed: boolean,
): Promise<MarketplaceListing> {
  await assertCanWrite(supabase, businessId);
  await assertPermission(supabase, businessId, "business.settings");
  const result = await supabase.rpc("set_marketplace_visible", {
    _business_id: businessId,
    _visible: listed,
  });
  return parseRpc("set marketplace listing", result, marketplaceListingSchema);
}

export async function listPublicPaths(): Promise<
  { slug: string; updatedAt: string; products: string[] }[]
> {
  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("list_public_store_paths");
  if (error) {
    console.error("[businessos] sitemap", error);
    return [];
  }
  const parsed = z
    .array(
      z.object({
        slug: z.string(),
        updatedAt: z.string(),
        products: z.array(z.string()).default([]),
      }),
    )
    .safeParse(data);
  return parsed.success ? parsed.data : [];
}

export async function createStoreComplaint(input: {
  slug: string;
  message: string;
  customer: { name: string; phone: string; email?: string | undefined };
  reference?: string | undefined;
  token?: string | undefined;
}) {
  const supabase = await storefrontClient();
  const result = await untypedRpc(supabase, "create_store_complaint", {
    _slug: input.slug,
    _customer: input.customer,
    _message: input.message,
    _reference: input.reference ?? "",
    _token: input.token ?? "",
  });
  const parsed = await parseRpc("create complaint", result, complaintResultSchema);
  return parsed;
}

export async function listStoreComplaints(
  supabase: Db,
  businessId: string,
): Promise<ComplaintItem[]> {
  const result = await untypedRpc(supabase, "list_store_complaints", { _business_id: businessId });
  return parseRpc("list complaints", result, complaintListSchema);
}

export async function respondStoreComplaint(
  supabase: Db,
  businessId: string,
  complaintId: string,
  status: string,
  note: string,
): Promise<ComplaintItem[]> {
  await assertCanWrite(supabase, businessId);
  const result = await untypedRpc(supabase, "respond_store_complaint", {
    _business_id: businessId,
    _complaint_id: complaintId,
    _status: status,
    _note: note,
  });
  return parseRpc("respond to complaint", result, complaintListSchema);
}

export async function loadProductReviews(slug: string, productId: string): Promise<ProductReviews> {
  const supabase = createAnonClient();
  const result = await untypedRpc(supabase, "list_store_reviews", {
    _slug: slug,
    _product_id: productId,
  });
  return parseRpc("list product reviews", result, productReviewsSchema);
}

export async function createStoreReview(input: {
  slug: string;
  reference: string;
  token: string;
  productId: string;
  rating: number;
  body: string;
}) {
  const supabase = await storefrontClient();
  const result = await untypedRpc(supabase, "create_store_review", {
    _slug: input.slug,
    _reference: input.reference,
    _token: input.token,
    _product_id: input.productId,
    _rating: input.rating,
    _body: input.body,
  });
  const parsed = await parseRpc("create review", result, complaintResultSchema);
  return parsed;
}

export async function listStoreReviewsAdmin(
  supabase: Db,
  businessId: string,
): Promise<AdminReviewItem[]> {
  const result = await untypedRpc(supabase, "list_store_reviews_admin", {
    _business_id: businessId,
  });
  return parseRpc("list merchant reviews", result, adminReviewListSchema);
}

export async function hideStoreReview(
  supabase: Db,
  businessId: string,
  reviewId: string,
  hidden: boolean,
): Promise<AdminReviewItem[]> {
  await assertCanWrite(supabase, businessId);
  await assertPermission(supabase, businessId, "business.settings");
  const result = await untypedRpc(supabase, "hide_store_review", {
    _business_id: businessId,
    _review_id: reviewId,
    _hidden: hidden,
  });
  return parseRpc("hide review", result, adminReviewListSchema);
}

export async function respondToStoreReview(
  supabase: Db,
  businessId: string,
  reviewId: string,
  response: string,
): Promise<AdminReviewItem[]> {
  await assertCanWrite(supabase, businessId);
  await assertPermission(supabase, businessId, "business.settings");
  const result = await untypedRpc(supabase, "respond_store_review", {
    _business_id: businessId,
    _review_id: reviewId,
    _response: response,
  });
  return parseRpc("respond to review", result, adminReviewListSchema);
}

export async function createListingReport(input: {
  slug: string;
  productId?: string | undefined;
  reason: string;
  detail: string;
  contact?: string | undefined;
}) {
  const supabase = createAnonClient();
  const result = await untypedRpc(supabase, "create_listing_report", {
    _slug: input.slug,
    _product_id: input.productId ?? null,
    _reason: input.reason,
    _detail: input.detail,
    _contact: input.contact ?? "",
  });
  const parsed = await parseRpc("create listing report", result, complaintResultSchema);
  return parsed;
}

export async function listListingReports(
  supabase: Db,
  businessId: string,
): Promise<ListingReportItem[]> {
  const result = await untypedRpc(supabase, "list_listing_reports", { _business_id: businessId });
  return parseRpc("list listing reports", result, listingReportListSchema);
}

export async function respondListingReport(
  supabase: Db,
  businessId: string,
  reportId: string,
  status: string,
  note: string,
): Promise<ListingReportItem[]> {
  await assertCanWrite(supabase, businessId);
  const result = await untypedRpc(supabase, "respond_listing_report", {
    _business_id: businessId,
    _report_id: reportId,
    _status: status,
    _note: note,
  });
  return parseRpc("respond to listing report", result, listingReportListSchema);
}

export async function loadShopperAccount(slug: string): Promise<ShopperAccount> {
  const ctx = await tryGetAuthedContext();
  if (!ctx) throw new AppError("Sign in to see your orders.");
  const result = await untypedRpc(ctx.supabase, "get_shopper_account", { _slug: slug });
  return parseRpc("load shopper account", result, shopperAccountSchema);
}

export async function claimShopperOrder(
  slug: string,
  reference: string,
  token: string,
): Promise<CustomerOrder> {
  const ctx = await tryGetAuthedContext();
  if (!ctx) throw new AppError("Sign in to save this order to your account.");
  const result = await untypedRpc(ctx.supabase, "claim_store_order", {
    _slug: slug,
    _reference: reference,
    _token: token,
  });
  return parseRpc("claim store order", result, customerOrderSchema);
}

export async function setShopperConsent(slug: string, messages: boolean): Promise<ShopperAccount> {
  const ctx = await tryGetAuthedContext();
  if (!ctx) throw new AppError("Sign in to update your preferences.");
  const result = await untypedRpc(ctx.supabase, "set_shopper_consent", {
    _slug: slug,
    _messages: messages,
  });
  return parseRpc("set shopper consent", result, shopperAccountSchema);
}
