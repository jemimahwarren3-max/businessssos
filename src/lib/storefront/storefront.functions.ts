import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";
import { assertCanWrite, assertPermission, type Db } from "@/lib/business.server";
import { saveShopPaynowCredentials } from "@/lib/payments/shop-paynow.server";
import { parseAndSanitize } from "@/lib/security";
import { loadPlatformFx } from "@/lib/platform-fx-read.server";
import { removeProductGalleryImage, uploadProductGalleryImage } from "@/lib/product-media.server";
import { authedRateLimit, ipRateLimit } from "@/lib/rate-limit.server";
import {
  checkoutSchema,
  createComplaintSchema,
  createListingReportSchema,
  createReviewSchema,
  listingSchema,
  saveStoreSchema,
} from "./contract";
import {
  claimShopperOrder,
  createListingReport,
  createStoreComplaint,
  createStoreReview,
  hideStoreReview,
  listListingReports,
  listStoreComplaints,
  listStoreReviewsAdmin,
  loadAdminOrder,
  loadAdminStore,
  loadCustomerOrder,
  loadShopperAccount,
  loadMarketplace,
  loadMarketplaceListing,
  loadProductReviews,
  loadPublicStore,
  loadStorePreview,
  placeOrder,
  publishStorefront,
  quoteCart,
  respondListingReport,
  respondStoreComplaint,
  saveListing,
  saveStorefront,
  setMarketplaceVisible,
  setShopperConsent,
  startCustomerPaynow,
  submitOrderPaymentNote,
  transitionOrder,
} from "./storefront.server";

const publicLimit = [
  ipRateLimit({ keyPrefix: "store-public", maxRequests: 60, windowSeconds: 60 }),
] as const;
const checkoutLimit = [
  ipRateLimit({ keyPrefix: "store-checkout", maxRequests: 15, windowSeconds: 60 }),
] as const;
const authed = [
  authedRateLimit({ keyPrefix: "store-admin", maxRequests: 60, windowSeconds: 60 }),
] as const;
const shopper = [
  authedRateLimit({ keyPrefix: "store-shopper", maxRequests: 30, windowSeconds: 60 }),
] as const;

export const getPlatformFxFn = createServerFn({ method: "GET" })
  .middleware(publicLimit)
  .handler(async () => loadPlatformFx());

export const getMarketplaceFn = createServerFn({ method: "POST" })
  .middleware(publicLimit)
  .inputValidator((data: unknown) =>
    parseAndSanitize(
      z.object({
        query: z.string().max(80).optional(),
        category: z.string().max(80).optional(),
      }),
      data,
    ),
  )
  .handler(async ({ data }) => loadMarketplace(data));

export const getMarketplaceListingFn = createServerFn({ method: "POST" })
  .middleware(authed)
  .inputValidator((data: unknown) =>
    parseAndSanitize(z.object({ businessId: z.string().uuid() }), data),
  )
  .handler(async ({ data, context }) =>
    loadMarketplaceListing(context.supabase as Db, data.businessId),
  );

export const setMarketplaceVisibleFn = createServerFn({ method: "POST" })
  .middleware(authed)
  .inputValidator((data: unknown) =>
    parseAndSanitize(z.object({ businessId: z.string().uuid(), listed: z.boolean() }), data),
  )
  .handler(async ({ data, context }) =>
    setMarketplaceVisible(context.supabase as Db, data.businessId, data.listed),
  );

export const getPublicStoreFn = createServerFn({ method: "POST" })
  .middleware(publicLimit)
  .inputValidator((data: unknown) =>
    parseAndSanitize(
      z.object({
        slug: z.string().min(1).max(40),
        query: z.string().max(80).optional(),
        category: z.string().max(80).optional(),
        sort: z.enum(["featured", "price_asc", "price_desc", "name"]).optional(),
      }),
      data,
    ),
  )
  .handler(async ({ data }) => loadPublicStore(data));

export const getStorePreviewFn = createServerFn({ method: "POST" })
  .middleware(authed)
  .inputValidator((data: unknown) =>
    parseAndSanitize(z.object({ slug: z.string().min(1).max(40) }), data),
  )
  .handler(async ({ data, context }) => loadStorePreview(context.supabase as Db, data.slug));

export const quoteCartFn = createServerFn({ method: "POST" })
  .middleware(publicLimit)
  .inputValidator((data: unknown) =>
    parseAndSanitize(
      z.object({
        slug: z.string().min(1).max(40),
        fulfilment: z.enum(["pickup", "delivery", "quote"]),
        items: checkoutSchema.shape.items,
      }),
      data,
    ),
  )
  .handler(async ({ data }) => quoteCart(data.slug, data.items, data.fulfilment));

export const placeOrderFn = createServerFn({ method: "POST" })
  .middleware(checkoutLimit)
  .inputValidator((data: unknown) => parseAndSanitize(checkoutSchema, data))
  .handler(async ({ data }) => placeOrder(data));

export const startCustomerPaynowFn = createServerFn({ method: "POST" })
  .middleware(checkoutLimit)
  .inputValidator((data: unknown) =>
    parseAndSanitize(
      z.object({
        slug: z.string().min(3).max(40),
        reference: z.string().min(3).max(40),
        token: z.string().max(80).optional().default(""),
        channel: z.enum(["web", "ecocash"]),
        phone: z.string().max(20).optional(),
      }),
      data,
    ),
  )
  .handler(async ({ data }) =>
    startCustomerPaynow({
      slug: data.slug,
      reference: data.reference,
      token: data.token,
      channel: data.channel,
      ...(data.phone ? { phone: data.phone } : {}),
    }),
  );

export const saveShopPaynowFn = createServerFn({ method: "POST" })
  .middleware(authed)
  .inputValidator((data: unknown) =>
    parseAndSanitize(
      z.object({
        businessId: z.string().uuid(),
        integrationId: z.string().trim().min(4).max(80),
        integrationKey: z.string().trim().min(8).max(200),
      }),
      data,
    ),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as Db;
    await assertCanWrite(supabase, data.businessId);
    await assertPermission(supabase, data.businessId, "business.settings");
    return saveShopPaynowCredentials(
      supabase,
      data.businessId,
      data.integrationId,
      data.integrationKey,
    );
  });

export const getCustomerOrderFn = createServerFn({ method: "POST" })
  .middleware(publicLimit)
  .inputValidator((data: unknown) =>
    parseAndSanitize(
      z.object({
        slug: z.string().min(1).max(40),
        reference: z.string().min(3).max(40),
        token: z.string().max(80).optional(),
      }),
      data,
    ),
  )
  .handler(async ({ data }) => loadCustomerOrder(data.slug, data.reference, data.token ?? ""));

export const getShopperAccountFn = createServerFn({ method: "POST" })
  .middleware(shopper)
  .inputValidator((data: unknown) =>
    parseAndSanitize(z.object({ slug: z.string().min(1).max(40) }), data),
  )
  .handler(async ({ data }) => loadShopperAccount(data.slug));

export const claimShopperOrderFn = createServerFn({ method: "POST" })
  .middleware(shopper)
  .inputValidator((data: unknown) =>
    parseAndSanitize(
      z.object({
        slug: z.string().min(1).max(40),
        reference: z.string().min(3).max(40),
        token: z.string().min(8).max(80),
      }),
      data,
    ),
  )
  .handler(async ({ data }) => claimShopperOrder(data.slug, data.reference, data.token));

export const setShopperConsentFn = createServerFn({ method: "POST" })
  .middleware(shopper)
  .inputValidator((data: unknown) =>
    parseAndSanitize(z.object({ slug: z.string().min(1).max(40), messages: z.boolean() }), data),
  )
  .handler(async ({ data }) => setShopperConsent(data.slug, data.messages));

export const getStorefrontAdminFn = createServerFn({ method: "POST" })
  .middleware(authed)
  .inputValidator((data: unknown) =>
    parseAndSanitize(z.object({ businessId: z.string().uuid() }), data),
  )
  .handler(async ({ data, context }) => loadAdminStore(context.supabase as Db, data.businessId));

export const saveStorefrontFn = createServerFn({ method: "POST" })
  .middleware(authed)
  .inputValidator((data: unknown) => parseAndSanitize(saveStoreSchema, data))
  .handler(async ({ data, context }) => {
    const { businessId, ...patch } = data;
    return saveStorefront(context.supabase as Db, businessId, patch as unknown as Json);
  });

export const publishStorefrontFn = createServerFn({ method: "POST" })
  .middleware(authed)
  .inputValidator((data: unknown) =>
    parseAndSanitize(z.object({ businessId: z.string().uuid(), published: z.boolean() }), data),
  )
  .handler(async ({ data, context }) =>
    publishStorefront(context.supabase as Db, data.businessId, data.published),
  );

export const saveListingFn = createServerFn({ method: "POST" })
  .middleware(authed)
  .inputValidator((data: unknown) => parseAndSanitize(listingSchema, data))
  .handler(async ({ data, context }) =>
    saveListing(context.supabase as Db, {
      businessId: data.businessId,
      productId: data.productId,
      published: data.published,
      details: data.details ?? "",
      sizeGuide: data.sizeGuide ?? "",
      minQty: data.minQty,
      maxQty: data.maxQty,
      featured: data.featured,
    }),
  );

export const getAdminOrderFn = createServerFn({ method: "POST" })
  .middleware(authed)
  .inputValidator((data: unknown) =>
    parseAndSanitize(z.object({ businessId: z.string().uuid(), orderId: z.string().uuid() }), data),
  )
  .handler(async ({ data, context }) =>
    loadAdminOrder(context.supabase as Db, data.businessId, data.orderId),
  );

export const transitionOrderFn = createServerFn({ method: "POST" })
  .middleware(authed)
  .inputValidator((data: unknown) =>
    parseAndSanitize(
      z.object({
        businessId: z.string().uuid(),
        orderId: z.string().uuid(),
        action: z.enum([
          "confirm",
          "accept",
          "preparing",
          "ready",
          "dispatch",
          "complete",
          "cancel",
          "mark_paid",
          "reject_proof",
        ]),
        reason: z.string().max(400).optional(),
      }),
      data,
    ),
  )
  .handler(async ({ data, context }) =>
    transitionOrder(
      context.supabase as Db,
      data.businessId,
      data.orderId,
      data.action,
      data.reason,
    ),
  );

export const submitOrderPaymentNoteFn = createServerFn({ method: "POST" })
  .middleware(checkoutLimit)
  .inputValidator((data: unknown) => {
    const raw = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    const proofBase64 = typeof raw["proofBase64"] === "string" ? raw["proofBase64"] : undefined;
    const parsed = parseAndSanitize(
      z.object({
        slug: z.string().min(3).max(40),
        reference: z.string().min(3).max(40),
        token: z.string().max(80).optional().default(""),
        proofReference: z.string().trim().max(80).optional(),
        proofNote: z.string().trim().max(400).optional(),
      }),
      { ...raw, ["proofBase64"]: undefined },
    );
    if (!(parsed.proofReference && parsed.proofReference.length >= 3) && !proofBase64) {
      throw new Error("Enter a payment reference or attach a screenshot.");
    }
    if (proofBase64 && proofBase64.length > 7_000_000) {
      throw new Error("That file is too large.");
    }
    return { ...parsed, proofBase64 };
  })
  .handler(async ({ data }) =>
    submitOrderPaymentNote({
      slug: data.slug,
      reference: data.reference,
      token: data.token,
      proofReference: data.proofReference,
      proofNote: data.proofNote,
      proofBase64: data.proofBase64,
    }),
  );

export const uploadStorefrontProductImageFn = createServerFn({ method: "POST" })
  .middleware(authed)
  .inputValidator((data: unknown): { businessId: string; productId: string; file: File } => {
    if (!(data instanceof FormData)) throw new Error("Choose a photo.");
    const businessId = String(data.get("businessId") ?? "");
    const productId = String(data.get("productId") ?? "");
    const file = data.get("file");
    if (
      !z.string().uuid().safeParse(businessId).success ||
      !z.string().uuid().safeParse(productId).success
    ) {
      throw new Error("That product could not be found.");
    }
    if (!(file instanceof File)) throw new Error("Choose a photo.");
    return { businessId, productId, file };
  })
  .handler(async ({ data, context }) =>
    uploadProductGalleryImage(context.supabase as Db, data.businessId, data.productId, data.file),
  );

export const removeStorefrontProductImageFn = createServerFn({ method: "POST" })
  .middleware(authed)
  .inputValidator((data: unknown) =>
    parseAndSanitize(
      z.object({
        businessId: z.string().uuid(),
        productId: z.string().uuid(),
        imageUrl: z.string().url().max(500),
      }),
      data,
    ),
  )
  .handler(async ({ data, context }) =>
    removeProductGalleryImage(
      context.supabase as Db,
      data.businessId,
      data.productId,
      data.imageUrl,
    ),
  );

export const createComplaintFn = createServerFn({ method: "POST" })
  .middleware(checkoutLimit)
  .inputValidator((data: unknown) => parseAndSanitize(createComplaintSchema, data))
  .handler(async ({ data }) => createStoreComplaint(data));

export const listComplaintsFn = createServerFn({ method: "POST" })
  .middleware(authed)
  .inputValidator((data: unknown) =>
    parseAndSanitize(z.object({ businessId: z.string().uuid() }), data),
  )
  .handler(async ({ data, context }) =>
    listStoreComplaints(context.supabase as Db, data.businessId),
  );

export const respondComplaintFn = createServerFn({ method: "POST" })
  .middleware(authed)
  .inputValidator((data: unknown) =>
    parseAndSanitize(
      z.object({
        businessId: z.string().uuid(),
        complaintId: z.string().uuid(),
        status: z.enum(["open", "reviewing", "resolved"]),
        note: z.string().max(2000).optional(),
      }),
      data,
    ),
  )
  .handler(async ({ data, context }) =>
    respondStoreComplaint(
      context.supabase as Db,
      data.businessId,
      data.complaintId,
      data.status,
      data.note ?? "",
    ),
  );

export const getProductReviewsFn = createServerFn({ method: "POST" })
  .middleware(publicLimit)
  .inputValidator((data: unknown) =>
    parseAndSanitize(
      z.object({ slug: z.string().min(1).max(40), productId: z.string().uuid() }),
      data,
    ),
  )
  .handler(async ({ data }) => loadProductReviews(data.slug, data.productId));

export const createReviewFn = createServerFn({ method: "POST" })
  .middleware(checkoutLimit)
  .inputValidator((data: unknown) => parseAndSanitize(createReviewSchema, data))
  .handler(async ({ data }) => createStoreReview(data));

export const listReviewsAdminFn = createServerFn({ method: "POST" })
  .middleware(authed)
  .inputValidator((data: unknown) =>
    parseAndSanitize(z.object({ businessId: z.string().uuid() }), data),
  )
  .handler(async ({ data, context }) =>
    listStoreReviewsAdmin(context.supabase as Db, data.businessId),
  );

export const hideReviewFn = createServerFn({ method: "POST" })
  .middleware(authed)
  .inputValidator((data: unknown) =>
    parseAndSanitize(
      z.object({
        businessId: z.string().uuid(),
        reviewId: z.string().uuid(),
        hidden: z.boolean(),
      }),
      data,
    ),
  )
  .handler(async ({ data, context }) =>
    hideStoreReview(context.supabase as Db, data.businessId, data.reviewId, data.hidden),
  );

export const createListingReportFn = createServerFn({ method: "POST" })
  .middleware(checkoutLimit)
  .inputValidator((data: unknown) => parseAndSanitize(createListingReportSchema, data))
  .handler(async ({ data }) => createListingReport(data));

export const listListingReportsFn = createServerFn({ method: "POST" })
  .middleware(authed)
  .inputValidator((data: unknown) =>
    parseAndSanitize(z.object({ businessId: z.string().uuid() }), data),
  )
  .handler(async ({ data, context }) =>
    listListingReports(context.supabase as Db, data.businessId),
  );

export const respondListingReportFn = createServerFn({ method: "POST" })
  .middleware(authed)
  .inputValidator((data: unknown) =>
    parseAndSanitize(
      z.object({
        businessId: z.string().uuid(),
        reportId: z.string().uuid(),
        status: z.enum(["open", "reviewing", "resolved"]),
        note: z.string().max(2000).optional(),
      }),
      data,
    ),
  )
  .handler(async ({ data, context }) =>
    respondListingReport(
      context.supabase as Db,
      data.businessId,
      data.reportId,
      data.status,
      data.note ?? "",
    ),
  );
