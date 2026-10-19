import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";
import type { Db } from "@/lib/business.server";
import { parseAndSanitize } from "@/lib/security";
import { authedRateLimit, ipRateLimit } from "@/lib/rate-limit.server";
import { checkoutSchema, listingSchema, saveStoreSchema } from "./contract";
import {
  loadAdminOrder,
  loadAdminStore,
  loadCustomerOrder,
  loadMarketplace,
  loadMarketplaceListing,
  loadPublicStore,
  loadStorePreview,
  placeOrder,
  publishStorefront,
  quoteCart,
  saveListing,
  saveStorefront,
  setMarketplaceVisible,
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

export const getCustomerOrderFn = createServerFn({ method: "POST" })
  .middleware(publicLimit)
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
  .handler(async ({ data }) => loadCustomerOrder(data.slug, data.reference, data.token));

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
        ]),
      }),
      data,
    ),
  )
  .handler(async ({ data, context }) =>
    transitionOrder(context.supabase as Db, data.businessId, data.orderId, data.action),
  );
