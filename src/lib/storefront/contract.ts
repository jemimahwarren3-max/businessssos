import { z } from "zod";
import { TEMPLATE_IDS } from "./templates";

const deliverySchema = z.object({
  pickupEnabled: z.boolean(),
  deliveryEnabled: z.boolean(),
  flatFee: z.coerce.number(),
  freeOver: z.coerce.number().nullable(),
  minimumOrder: z.coerce.number(),
  areas: z.string(),
  estimate: z.string(),
});

const paymentsSchema = z.object({
  payOnPickup: z.boolean(),
  payOnDelivery: z.boolean(),
  quotes: z.boolean(),
  paynow: z.boolean(),
});

export const publicProductSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  details: z.string(),
  sizeGuide: z.string(),
  imageUrl: z.string().nullable(),
  price: z.coerce.number(),
  currency: z.string(),
  unit: z.string(),
  taxRate: z.coerce.number(),
  categoryId: z.string().nullable(),
  categoryName: z.string().nullable(),
  minQty: z.coerce.number(),
  maxQty: z.coerce.number().nullable(),
  featured: z.boolean(),
  available: z.boolean(),
  stockLabel: z.string(),
  maxPurchasable: z.coerce.number(),
});

export const publicStoreSchema = z.object({
  slug: z.string(),
  status: z.enum(["draft", "published"]),
  templateId: z.enum(TEMPLATE_IDS),
  storeName: z.string(),
  tagline: z.string(),
  about: z.string(),
  whatsapp: z.string(),
  email: z.string(),
  phone: z.string(),
  address: z.string(),
  logoUrl: z.string().nullable(),
  accentColor: z.string().nullable(),
  heroTitle: z.string(),
  heroSubtitle: z.string(),
  policies: z.string(),
  hours: z.string(),
  socials: z.object({
    instagram: z.string().nullable(),
    facebook: z.string().nullable(),
    website: z.string().nullable(),
    tiktok: z.string().nullable(),
  }),
  currency: z.string(),
  businessType: z.string(),
  delivery: deliverySchema,
  payments: paymentsSchema,
  categories: z.array(z.object({ id: z.string(), name: z.string() })),
  products: z.array(publicProductSchema),
  preview: z.boolean().optional(),
});

export type PublicStore = z.infer<typeof publicStoreSchema>;
export type PublicProduct = z.infer<typeof publicProductSchema>;

export const marketplaceProductSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  price: z.coerce.number(),
  currency: z.string(),
  imageUrl: z.string().nullable(),
  categoryName: z.string().nullable(),
  stockLabel: z.string(),
  available: z.boolean(),
  featured: z.boolean(),
  storeSlug: z.string(),
  storeName: z.string(),
});

export const marketplaceSchema = z.object({
  query: z.string(),
  category: z.string(),
  shops: z.array(
    z.object({
      slug: z.string(),
      storeName: z.string(),
      tagline: z.string(),
      businessType: z.string(),
      logoUrl: z.string().nullable(),
      address: z.string(),
      currency: z.string(),
    }),
  ),
  products: z.array(marketplaceProductSchema),
  categories: z.array(z.object({ name: z.string(), count: z.coerce.number() })),
  featured: z.array(marketplaceProductSchema),
  recent: z.array(marketplaceProductSchema),
});

export const marketplaceListingSchema = z.object({
  listed: z.boolean(),
  hasStore: z.boolean(),
});

export type Marketplace = z.infer<typeof marketplaceSchema>;
export type MarketplaceProduct = z.infer<typeof marketplaceProductSchema>;
export type MarketplaceListing = z.infer<typeof marketplaceListingSchema>;

export const quoteSchema = z.object({
  currency: z.string(),
  subtotal: z.coerce.number(),
  tax: z.coerce.number(),
  deliveryFee: z.coerce.number(),
  total: z.coerce.number(),
  lines: z.array(
    z.object({
      productId: z.string(),
      name: z.string(),
      quantity: z.coerce.number(),
      unitPrice: z.coerce.number(),
      tax: z.coerce.number(),
      lineTotal: z.coerce.number(),
      note: z.string().nullable().optional(),
      slug: z.string().optional(),
    }),
  ),
});

export type CartQuote = z.infer<typeof quoteSchema>;

export const checkoutResultSchema = z.object({
  reference: z.string(),
  replayed: z.boolean(),
  accessToken: z.string().nullable(),
  fulfilmentStatus: z.string(),
  paymentStatus: z.string(),
  paymentMethod: z.string(),
  fulfilmentMethod: z.string().optional(),
  total: z.coerce.number(),
  currency: z.string(),
  subtotal: z.coerce.number().optional(),
  tax: z.coerce.number().optional(),
  deliveryFee: z.coerce.number().optional(),
});

export const customerOrderSchema = z.object({
  reference: z.string(),
  storeName: z.string(),
  fulfilmentStatus: z.string(),
  paymentStatus: z.string(),
  paymentMethod: z.string(),
  fulfilmentMethod: z.string(),
  customerName: z.string(),
  customerPhone: z.string(),
  customerEmail: z.string().nullable(),
  customerAddress: z.string().nullable(),
  customerNotes: z.string().nullable(),
  subtotal: z.coerce.number(),
  tax: z.coerce.number(),
  deliveryFee: z.coerce.number(),
  total: z.coerce.number(),
  currency: z.string(),
  createdAt: z.string(),
  paid: z.boolean(),
  revenueRecorded: z.boolean(),
  items: z.array(
    z.object({
      name: z.string(),
      quantity: z.coerce.number(),
      unitPrice: z.coerce.number(),
      lineTotal: z.coerce.number(),
      note: z.string().nullable(),
    }),
  ),
});

export type CustomerOrder = z.infer<typeof customerOrderSchema>;

const adminProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  sku: z.string().nullable(),
  price: z.coerce.number(),
  stock: z.coerce.number(),
  unit: z.string(),
  imageUrl: z.string().nullable(),
  categoryName: z.string().nullable(),
  published: z.boolean(),
  slug: z.string().nullable(),
  featured: z.boolean(),
  minQty: z.coerce.number(),
  maxQty: z.coerce.number().nullable(),
  details: z.string(),
  sizeGuide: z.string(),
});

export const adminStoreSchema = z.object({
  currency: z.string(),
  store: z
    .object({
      slug: z.string(),
      status: z.enum(["draft", "published"]),
      templateId: z.enum(TEMPLATE_IDS),
      storeName: z.string(),
      tagline: z.string(),
      about: z.string(),
      whatsapp: z.string(),
      email: z.string(),
      phone: z.string(),
      address: z.string(),
      logoUrl: z.string().nullable(),
      accentColor: z.string().nullable(),
      heroTitle: z.string(),
      heroSubtitle: z.string(),
      policies: z.string(),
      hours: z.string(),
      socials: z.object({
        instagram: z.string().nullable(),
        facebook: z.string().nullable(),
        website: z.string().nullable(),
        tiktok: z.string().nullable(),
      }),
      delivery: deliverySchema,
      payments: paymentsSchema,
      publishedAt: z.string().nullable(),
      previewedAt: z.string().nullable(),
    })
    .nullable(),
  checklist: z.object({
    name: z.boolean(),
    template: z.boolean(),
    products: z.boolean(),
    payments: z.boolean(),
    fulfilment: z.boolean(),
    policies: z.boolean(),
    previewed: z.boolean(),
    published: z.boolean(),
  }),
  products: z.array(adminProductSchema),
  orders: z.array(
    z.object({
      id: z.string(),
      reference: z.string(),
      createdAt: z.string(),
      customerName: z.string(),
      customerPhone: z.string(),
      total: z.coerce.number(),
      currency: z.string(),
      paymentStatus: z.string(),
      fulfilmentStatus: z.string(),
      paymentMethod: z.string(),
      fulfilmentMethod: z.string(),
      saleId: z.string().nullable(),
      itemCount: z.coerce.number(),
    }),
  ),
  metrics: z.object({
    openOrders: z.coerce.number(),
    unpaidOrders: z.coerce.number(),
    outOfStockPublished: z.coerce.number(),
    lowStockPublished: z.coerce.number(),
    publishedProducts: z.coerce.number(),
  }),
});

export type AdminStore = z.infer<typeof adminStoreSchema>;

export const adminOrderSchema = z.object({
  id: z.string(),
  reference: z.string(),
  fulfilmentStatus: z.string(),
  paymentStatus: z.string(),
  paymentMethod: z.string(),
  fulfilmentMethod: z.string(),
  customerName: z.string(),
  customerPhone: z.string(),
  customerEmail: z.string().nullable(),
  customerAddress: z.string().nullable(),
  customerNotes: z.string().nullable(),
  subtotal: z.coerce.number(),
  tax: z.coerce.number(),
  deliveryFee: z.coerce.number(),
  total: z.coerce.number(),
  currency: z.string(),
  saleId: z.string().nullable(),
  stockReserved: z.boolean(),
  createdAt: z.string(),
  items: customerOrderSchema.shape.items,
  events: z.array(
    z.object({
      eventType: z.string(),
      message: z.string(),
      createdAt: z.string(),
    }),
  ),
});

export type AdminOrder = z.infer<typeof adminOrderSchema>;

export const saveStoreSchema = z.object({
  businessId: z.string().uuid(),
  storeName: z.string().trim().min(2).max(120),
  slug: z.string().trim().max(40).optional(),
  templateId: z.enum(TEMPLATE_IDS),
  tagline: z.string().max(160).optional(),
  about: z.string().max(2000).optional(),
  whatsapp: z.string().max(20).optional(),
  email: z.string().max(120).optional(),
  phone: z.string().max(40).optional(),
  address: z.string().max(300).optional(),
  logoUrl: z.string().max(500).optional(),
  accentColor: z.string().max(7).optional(),
  heroTitle: z.string().max(120).optional(),
  heroSubtitle: z.string().max(200).optional(),
  policies: z.string().max(4000).optional(),
  hours: z.string().max(300).optional(),
  socials: z
    .object({
      instagram: z.string().max(500).optional(),
      facebook: z.string().max(500).optional(),
      website: z.string().max(500).optional(),
      tiktok: z.string().max(500).optional(),
    })
    .optional(),
  delivery: z.object({
    pickupEnabled: z.boolean(),
    deliveryEnabled: z.boolean(),
    flatFee: z.coerce.number().min(0).max(100000),
    freeOver: z.coerce.number().min(0).max(1000000).nullable(),
    minimumOrder: z.coerce.number().min(0).max(1000000),
    areas: z.string().max(300),
    estimate: z.string().max(120),
  }),
  payments: z.object({
    payOnPickup: z.boolean(),
    payOnDelivery: z.boolean(),
    quotes: z.boolean(),
  }),
});

export const listingSchema = z.object({
  businessId: z.string().uuid(),
  productId: z.string().uuid(),
  published: z.boolean(),
  details: z.string().max(2000).optional(),
  sizeGuide: z.string().max(2000).optional(),
  minQty: z.coerce.number().positive().max(10000),
  maxQty: z.coerce.number().positive().max(10000).nullable(),
  featured: z.boolean(),
});

export const cartItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().positive().max(10000),
  note: z.string().max(200).optional(),
});

export const checkoutSchema = z.object({
  slug: z.string().min(3).max(40),
  idempotencyKey: z.string().min(8).max(80),
  fulfilment: z.enum(["pickup", "delivery", "quote"]),
  paymentMethod: z.enum(["pay_on_pickup", "pay_on_delivery", "quote"]),
  customer: z.object({
    name: z.string().trim().min(2).max(80),
    phone: z.string().trim().min(7).max(20),
    email: z.string().trim().max(120).optional(),
    address: z.string().trim().max(300).optional(),
    notes: z.string().trim().max(500).optional(),
  }),
  items: z.array(cartItemSchema).min(1).max(50),
});
