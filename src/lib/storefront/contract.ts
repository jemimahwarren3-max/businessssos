import { z } from "zod";
import { TEMPLATE_IDS } from "./templates";
import { STOREFRONT_THEME_SCHEMA } from "./theme";

const deliverySchema = z.object({
  pickupEnabled: z.boolean(),
  deliveryEnabled: z.boolean(),
  flatFee: z.coerce.number(),
  freeOver: z.coerce.number().nullable(),
  minimumOrder: z.coerce.number(),
  areas: z.string(),
  estimate: z.string(),
  quoteRequired: z.boolean().catch(false),
  autoAccept: z.boolean().catch(false),
  prepMinutes: z.coerce.number().catch(0),
  cutoff: z.string().catch(""),
  cutoffTime: z.string().nullable().catch(null),
  collectionWindows: z.string().catch(""),
  timezone: z.string().catch("Africa/Harare"),
  weeklyHours: z
    .array(
      z.object({
        weekday: z.coerce.number().int().min(1).max(7),
        open: z.string(),
        close: z.string(),
      }),
    )
    .catch([]),
  windows: z
    .array(
      z.object({
        weekday: z.coerce.number().int().min(1).max(7),
        start: z.string(),
        end: z.string(),
      }),
    )
    .catch([]),
});

const manualPaymentMethodSchema = z.object({
  id: z.string().max(40),
  kind: z.enum(["ecocash", "innbucks", "bank_transfer", "other"]),
  enabled: z.boolean(),
  accountName: z.string().max(80).catch(""),
  accountDetail: z.string().max(80).catch(""),
  instructions: z.string().max(500).catch(""),
});

const paymentsSchema = z.object({
  payOnPickup: z.boolean(),
  payOnDelivery: z.boolean(),
  quotes: z.boolean(),
  paynow: z.boolean(),
  paynowAvailable: z.boolean().optional(),
  acceptPaynow: z.boolean().catch(false),
  cashCurrencies: z.string().catch(""),
  exactCash: z.boolean().catch(false),
  changeProvided: z.boolean().catch(false),
  manualMethods: z.array(manualPaymentMethodSchema).max(8).catch([]),
});

const orderTermsSchema = z.object({
  delivery: deliverySchema.optional(),
  payments: paymentsSchema.optional(),
  currency: z.string().optional(),
  deliveryFee: z.coerce.number().optional(),
  subtotal: z.coerce.number().optional(),
  tax: z.coerce.number().optional(),
  total: z.coerce.number().optional(),
  collectAt: z.string().nullable().optional(),
  manualPayment: manualPaymentMethodSchema.optional(),
  paymentProof: z
    .object({
      reference: z.string().catch(""),
      note: z.string().catch(""),
      submittedAt: z.string().optional(),
      rejectedAt: z.string().optional(),
      rejectReason: z.string().catch(""),
      storagePath: z.string().max(200).nullable().optional(),
    })
    .optional(),
});

export const publicProductSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  details: z.string(),
  sizeGuide: z.string(),
  imageUrl: z.string().nullable(),
  galleryUrls: z.array(z.string().max(500)).max(8).default([]),
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

const storefrontCollectionSchema = z.object({
  id: z.string().max(40),
  title: z.string().max(80),
  description: z.string().max(200),
  categoryName: z.string().max(80),
});

const storefrontPromoTileSchema = z.object({
  id: z.string().max(40),
  title: z.string().max(80),
  subtitle: z.string().max(160),
  imageUrl: z.string().max(500),
  categoryName: z.string().max(80),
});

const storefrontFaqSchema = z.object({
  question: z.string().max(200),
  answer: z.string().max(1000),
});

export const storefrontContentSchema = z.object({
  announcement: z.string().max(200).default(""),
  seoTitle: z.string().max(60).default(""),
  seoDescription: z.string().max(160).default(""),
  collections: z.array(storefrontCollectionSchema).max(6).default([]),
  promoTiles: z.array(storefrontPromoTileSchema).max(4).default([]),
  faqs: z.array(storefrontFaqSchema).max(12).default([]),
  deliveryPolicy: z.string().max(2000).default(""),
  returnsPolicy: z.string().max(2000).default(""),
  privacyPolicy: z.string().max(2000).default(""),
});

export type StorefrontContent = z.infer<typeof storefrontContentSchema>;
export const EMPTY_STOREFRONT_CONTENT: StorefrontContent = storefrontContentSchema.parse({});

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
  theme: STOREFRONT_THEME_SCHEMA,
  content: storefrontContentSchema.default(EMPTY_STOREFRONT_CONTENT),
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

export const EMPTY_MARKETPLACE: Marketplace = {
  query: "",
  category: "",
  shops: [],
  products: [],
  categories: [],
  featured: [],
  recent: [],
};
export type MarketplaceProduct = z.infer<typeof marketplaceProductSchema>;
export type MarketplaceListing = z.infer<typeof marketplaceListingSchema>;

export const complaintResultSchema = z.object({
  id: z.string(),
  status: z.string(),
});

export const complaintListSchema = z.array(
  z.object({
    id: z.string(),
    createdAt: z.string(),
    status: z.string(),
    customerName: z.string(),
    customerPhone: z.string(),
    customerEmail: z.string().nullable().optional(),
    message: z.string(),
    merchantNote: z.string().nullable().optional(),
    orderReference: z.string().nullable().optional(),
  }),
);

export const createComplaintSchema = z.object({
  slug: z.string().min(3).max(40),
  message: z.string().trim().min(8).max(2000),
  customer: z.object({
    name: z.string().trim().min(2).max(80),
    phone: z.string().trim().min(7).max(20),
    email: z.string().trim().max(120).optional(),
  }),
  reference: z.string().max(40).optional(),
  token: z.string().max(80).optional(),
});

export type ComplaintItem = z.infer<typeof complaintListSchema>[number];

export const publicReviewSchema = z.object({
  id: z.string(),
  rating: z.coerce.number(),
  body: z.string(),
  displayName: z.string(),
  createdAt: z.string(),
  verifiedPurchase: z.boolean(),
  merchantResponse: z.string().nullable().optional(),
  merchantRespondedAt: z.string().nullable().optional(),
});

export const productReviewsSchema = z.object({
  count: z.coerce.number(),
  average: z.coerce.number().nullable(),
  reviews: z.array(publicReviewSchema),
});

export const createReviewSchema = z.object({
  slug: z.string().min(3).max(40),
  reference: z.string().min(3).max(40),
  token: z.string().min(8).max(80),
  productId: z.string().uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  body: z.string().trim().min(8).max(1000),
});

export const storeReviewResponseSchema = z.object({
  businessId: z.string().uuid(),
  reviewId: z.string().uuid(),
  response: z.string().trim().min(2).max(1000),
});

export const adminReviewListSchema = z.array(
  z.object({
    id: z.string(),
    createdAt: z.string(),
    status: z.string(),
    rating: z.coerce.number(),
    body: z.string(),
    displayName: z.string(),
    productName: z.string().nullable().optional(),
    orderReference: z.string().nullable().optional(),
    merchantResponse: z.string().nullable().optional(),
    merchantRespondedAt: z.string().nullable().optional(),
  }),
);

export const listingReportReasons = ["misleading", "prohibited", "spam", "other"] as const;

export const createListingReportSchema = z.object({
  slug: z.string().min(3).max(40),
  productId: z.string().uuid().optional(),
  reason: z.enum(listingReportReasons),
  detail: z.string().trim().min(8).max(2000),
  contact: z.string().trim().max(120).optional(),
});

export const listingReportListSchema = z.array(
  z.object({
    id: z.string(),
    createdAt: z.string(),
    status: z.string(),
    reason: z.string(),
    detail: z.string(),
    reporterContact: z.string().nullable().optional(),
    merchantNote: z.string().nullable().optional(),
    productName: z.string().nullable().optional(),
  }),
);

export type ProductReviews = z.infer<typeof productReviewsSchema>;
export type AdminReviewItem = z.infer<typeof adminReviewListSchema>[number];
export type ListingReportItem = z.infer<typeof listingReportListSchema>[number];

export const emptyProductReviews: ProductReviews = { count: 0, average: null, reviews: [] };

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
  orderId: z.string().uuid().optional(),
  fulfilmentStatus: z.string(),
  paymentStatus: z.string(),
  paymentMethod: z.string(),
  fulfilmentMethod: z.string().optional(),
  total: z.coerce.number(),
  currency: z.string(),
  subtotal: z.coerce.number().optional(),
  tax: z.coerce.number().optional(),
  deliveryFee: z.coerce.number().optional(),
  collectAt: z.string().nullable().optional(),
  paynow: z
    .object({
      redirectUrl: z.string().optional(),
      instructions: z.string().optional(),
      paynowReference: z.string(),
    })
    .nullable()
    .optional(),
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
  collectAt: z.string().nullable().optional(),
  mine: z.boolean().optional(),
  paid: z.boolean(),
  revenueRecorded: z.boolean(),
  proofUrl: z.string().nullable().optional(),
  terms: orderTermsSchema.optional(),
  items: z.array(
    z.object({
      name: z.string(),
      quantity: z.coerce.number(),
      unitPrice: z.coerce.number(),
      lineTotal: z.coerce.number(),
      note: z.string().nullable(),
      productId: z.string().uuid().nullable().optional(),
      canReview: z.boolean().catch(false),
      reviewed: z.boolean().catch(false),
    }),
  ),
});

export type CustomerOrder = z.infer<typeof customerOrderSchema>;

export const shopperOrderSummarySchema = z.object({
  reference: z.string(),
  createdAt: z.string(),
  total: z.coerce.number(),
  currency: z.string(),
  fulfilmentStatus: z.string(),
  paymentStatus: z.string(),
  paymentMethod: z.string().optional(),
  fulfilmentMethod: z.string(),
  itemSummary: z.string().nullable().optional(),
  collectAt: z.string().nullable().optional(),
});

export const shopperAccountSchema = z.object({
  messagesConsent: z.boolean(),
  orders: z.array(shopperOrderSummarySchema),
});

export type ShopperAccount = z.infer<typeof shopperAccountSchema>;
export type ShopperOrderSummary = z.infer<typeof shopperOrderSummarySchema>;

const adminProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  publicName: z.string().nullable(),
  categoryId: z.string().nullable(),
  sku: z.string().nullable(),
  price: z.coerce.number(),
  stock: z.coerce.number(),
  unit: z.string(),
  imageUrl: z.string().nullable(),
  galleryUrls: z.array(z.string().max(500)).max(8).default([]),
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
  categories: z.array(z.object({ id: z.string(), name: z.string() })).default([]),
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
      theme: STOREFRONT_THEME_SCHEMA,
      content: storefrontContentSchema.default(EMPTY_STOREFRONT_CONTENT),
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
      itemSummary: z.string().nullable().optional(),
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
  collectAt: z.string().nullable().optional(),
  proofUrl: z.string().nullable().optional(),
  terms: orderTermsSchema.optional(),
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
  email: z.string().trim().email().max(120).or(z.literal("")).optional(),
  phone: z.string().max(40).optional(),
  address: z.string().max(300).optional(),
  logoUrl: z.string().max(500).optional(),
  accentColor: z.string().max(7).optional(),
  theme: STOREFRONT_THEME_SCHEMA,
  content: storefrontContentSchema.optional(),
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
    quoteRequired: z.boolean(),
    autoAccept: z.boolean(),
    prepMinutes: z.coerce.number().int().min(0).max(10080),
    cutoff: z.string().max(120),
    cutoffTime: z.string().max(5).nullable().optional(),
    collectionWindows: z.string().max(200),
    timezone: z.string().max(40).optional(),
    weeklyHours: z
      .array(
        z.object({
          weekday: z.coerce.number().int().min(1).max(7),
          open: z.string().max(5),
          close: z.string().max(5),
        }),
      )
      .max(7)
      .optional(),
    windows: z
      .array(
        z.object({
          weekday: z.coerce.number().int().min(1).max(7),
          start: z.string().max(5),
          end: z.string().max(5),
        }),
      )
      .max(21)
      .optional(),
  }),
  payments: z.object({
    payOnPickup: z.boolean(),
    payOnDelivery: z.boolean(),
    quotes: z.boolean(),
    acceptPaynow: z.boolean(),
    cashCurrencies: z.string().max(40),
    exactCash: z.boolean(),
    changeProvided: z.boolean(),
    manualMethods: z.array(manualPaymentMethodSchema).max(8).optional(),
  }),
});

export const listingSchema = z.object({
  businessId: z.string().uuid(),
  productId: z.string().uuid(),
  published: z.boolean(),
  publicName: z.string().trim().max(160).nullable().optional(),
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
  campaignId: z.string().uuid().optional(),
  analyticsVisitorId: z.string().uuid().optional(),
  idempotencyKey: z.string().min(8).max(80),
  fulfilment: z.enum(["pickup", "delivery", "quote"]),
  paymentMethod: z.enum(["pay_on_pickup", "pay_on_delivery", "quote", "paynow", "manual"]),
  paynowChannel: z.enum(["web", "ecocash"]).optional(),
  manualMethodId: z.string().max(40).optional(),
  customer: z.object({
    name: z.string().trim().min(2).max(80),
    phone: z.string().trim().min(7).max(20),
    email: z.string().trim().max(120).optional(),
    address: z.string().trim().max(300).optional(),
    notes: z.string().trim().max(500).optional(),
    messagesConsent: z.boolean().optional(),
  }),
  items: z.array(cartItemSchema).min(1).max(50),
  collectAt: z.string().max(40).optional(),
});
