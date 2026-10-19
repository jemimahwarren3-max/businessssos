import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";
import { createAnonClient } from "@/lib/auth/session.server";
import { AppError, assertCanWrite, assertPermission, dbFail, type Db } from "@/lib/business.server";
import {
  adminOrderSchema,
  adminStoreSchema,
  checkoutResultSchema,
  customerOrderSchema,
  marketplaceListingSchema,
  marketplaceSchema,
  publicStoreSchema,
  quoteSchema,
  type AdminOrder,
  type AdminStore,
  type CartQuote,
  type CustomerOrder,
  type Marketplace,
  type MarketplaceListing,
  type PublicStore,
} from "./contract";

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
  schema: z.ZodType<T>,
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
  return parseRpc("load public store", { data, error: null }, publicStoreSchema);
}

export async function loadStorePreview(supabase: Db, slug: string): Promise<PublicStore | null> {
  const { data, error } = await supabase.rpc("get_store_preview", { _slug: slug });
  if (error) rpcFail("preview store", error);
  if (data == null) return null;
  return parseRpc("preview store", { data, error: null }, publicStoreSchema);
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
  idempotencyKey: string;
  customer: {
    name: string;
    phone: string;
    email?: string | undefined;
    address?: string | undefined;
    notes?: string | undefined;
  };
  items: { productId: string; quantity: number; note?: string | undefined }[];
  fulfilment: string;
  paymentMethod: string;
}) {
  const supabase = createAnonClient();
  const result = await supabase.rpc("create_store_order", {
    _slug: input.slug,
    _idempotency_key: input.idempotencyKey,
    _customer: input.customer as unknown as Json,
    _items: input.items as unknown as Json,
    _fulfilment: input.fulfilment,
    _payment_method: input.paymentMethod,
  });
  return parseRpc("create store order", result, checkoutResultSchema);
}

export async function loadCustomerOrder(
  slug: string,
  reference: string,
  token: string,
): Promise<CustomerOrder> {
  const supabase = createAnonClient();
  const result = await supabase.rpc("get_store_order", {
    _slug: slug,
    _reference: reference,
    _token: token,
  });
  return parseRpc("load store order", result, customerOrderSchema);
}

export async function loadAdminStore(supabase: Db, businessId: string): Promise<AdminStore> {
  const result = await supabase.rpc("get_storefront_admin", { _business_id: businessId });
  return parseRpc("load storefront", result, adminStoreSchema);
}

export async function saveStorefront(supabase: Db, businessId: string, patch: Json) {
  await assertCanWrite(supabase, businessId);
  await assertPermission(supabase, businessId, "business.settings");
  const result = await supabase.rpc("save_storefront", {
    _business_id: businessId,
    _patch: patch,
  });
  return parseRpc("save storefront", result, adminStoreSchema);
}

export async function publishStorefront(supabase: Db, businessId: string, published: boolean) {
  await assertCanWrite(supabase, businessId);
  await assertPermission(supabase, businessId, "business.settings");
  const result = await supabase.rpc("set_storefront_published", {
    _business_id: businessId,
    _published: published,
  });
  return parseRpc("publish storefront", result, adminStoreSchema);
}

export async function saveListing(
  supabase: Db,
  input: {
    businessId: string;
    productId: string;
    published: boolean;
    details: string;
    sizeGuide: string;
    minQty: number;
    maxQty: number | null;
    featured: boolean;
  },
) {
  await assertCanWrite(supabase, input.businessId);
  await assertPermission(supabase, input.businessId, "business.settings");
  const { error } = await supabase.rpc("set_product_listing", {
    _business_id: input.businessId,
    _product_id: input.productId,
    _published: input.published,
    _details: input.details,
    _size_guide: input.sizeGuide,
    _min_qty: input.minQty,
    _max_qty: input.maxQty,
    _featured: input.featured,
  });
  if (error) rpcFail("save listing", error);
}

export async function loadAdminOrder(
  supabase: Db,
  businessId: string,
  orderId: string,
): Promise<AdminOrder> {
  const result = await supabase.rpc("get_store_order_admin", {
    _business_id: businessId,
    _order_id: orderId,
  });
  return parseRpc("load online order", result, adminOrderSchema);
}

export async function transitionOrder(
  supabase: Db,
  businessId: string,
  orderId: string,
  action: string,
) {
  await assertCanWrite(supabase, businessId);
  const result = await supabase.rpc("transition_store_order", {
    _business_id: businessId,
    _order_id: orderId,
    _action: action,
  });
  return parseRpc("update online order", result, adminOrderSchema);
}

export async function loadMarketplace(input: {
  query?: string | undefined;
  category?: string | undefined;
}): Promise<Marketplace> {
  const supabase = createAnonClient();
  const result = await supabase.rpc("browse_marketplace", {
    _query: input.query ?? "",
    _category: input.category ?? "",
    _limit: 24,
    _offset: 0,
  });
  return parseRpc("browse marketplace", result, marketplaceSchema);
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
