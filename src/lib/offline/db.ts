import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export type CachedProduct = {
  id: string;
  businessId: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  unit: string;
  selling_price: number;
  tax_rate: number;
  stock: number;
  /** When this catalogue row was last written while online. Stock is an
   * estimate after this. */
  cachedAt?: string;
};

export type PendingSaleItem = { productId: string; quantity: number; unitPrice: number };

export type PendingSale = {
  localId: string;
  businessId: string;
  idempotencyKey: string;
  customerId: string;
  discount: number;
  paymentMethod: string;
  rail?: string;
  tenders?: {
    rail: string;
    amount: number;
    currency?: string;
    amountOriginal?: number;
  }[];
  items: PendingSaleItem[];
  createdAt: string;
  status: "pending" | "syncing" | "failed";
  error?: string;
  isOverSold?: boolean;
  isClosedDrawer?: boolean;
};

/** In-progress POS cart. Survives refresh and power loss on this device.
 * Not a completed sale, logout drops it so a shared tablet does not leave
 * the last ring-up on screen. */
export type PosDraftCartItem = {
  productId: string;
  name: string;
  sku: string | null;
  unitPrice: number;
  taxRate: number;
  quantity: number;
  stock: number;
};

export type PosDraftTender = {
  key: string;
  rail: string;
  amount: string;
  currency: string;
  amountOriginal: string;
  showOriginal: boolean;
};

export type PosDraft = {
  businessId: string;
  cart: PosDraftCartItem[];
  customerId: string;
  discount: string;
  paymentRail: string;
  splitPay: boolean;
  tenders: PosDraftTender[];
  updatedAt: string;
};

interface OfflineSchema extends DBSchema {
  products: {
    key: string;
    value: CachedProduct;
    indexes: { "by-business": string };
  };
  pendingSales: {
    key: string;
    value: PendingSale;
    indexes: { "by-business": string };
  };
  posDrafts: {
    key: string;
    value: PosDraft;
  };
}

let dbPromise: Promise<IDBPDatabase<OfflineSchema>> | undefined;

function getDb() {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB isn't available in this environment.");
  }
  if (!dbPromise) {
    // Version 2 adds posDrafts only. Do not drop or rebuild pendingSales,
    // unsynced cash sales from v1 must still be on this device after upgrade.
    dbPromise = openDB<OfflineSchema>("businessos-offline", 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const products = db.createObjectStore("products", { keyPath: "id" });
          products.createIndex("by-business", "businessId");
          const sales = db.createObjectStore("pendingSales", { keyPath: "localId" });
          sales.createIndex("by-business", "businessId");
        }
        if (oldVersion < 2 && !db.objectStoreNames.contains("posDrafts")) {
          db.createObjectStore("posDrafts", { keyPath: "businessId" });
        }
      },
    });
  }
  return dbPromise;
}

function withCacheMeta(product: CachedProduct): CachedProduct {
  return {
    ...product,
    cachedAt: product.cachedAt ?? new Date().toISOString(),
  };
}

/** Wholesale replace, used once to seed the cache with a broad product
 * snapshot (not per-search, or a narrow search would evict everything else
 * already cached). */
export async function replaceCachedProducts(businessId: string, products: CachedProduct[]) {
  const db = await getDb();
  const tx = db.transaction("products", "readwrite");
  const existing = await tx.store.index("by-business").getAllKeys(businessId);
  await Promise.all(existing.map((key) => tx.store.delete(key)));
  await Promise.all(products.map((product) => tx.store.put(withCacheMeta(product))));
  await tx.done;
}

/** Adds/updates individual products without touching the rest of the cache,
 * used after every live search so products found while online stay available
 * offline too, on top of the initial seed. */
export async function upsertCachedProducts(businessId: string, products: CachedProduct[]) {
  const db = await getDb();
  const tx = db.transaction("products", "readwrite");
  await Promise.all(
    products.map((product) => tx.store.put(withCacheMeta({ ...product, businessId }))),
  );
  await tx.done;
}

export async function getCachedProducts(businessId: string): Promise<CachedProduct[]> {
  const db = await getDb();
  return db.getAllFromIndex("products", "by-business", businessId);
}

export async function searchCachedProducts(businessId: string, term: string) {
  const all = await getCachedProducts(businessId);
  const needle = term.trim().toLowerCase();
  if (!needle) return [];
  return all.filter(
    (p) =>
      p.name.toLowerCase().includes(needle) ||
      (p.sku ?? "").toLowerCase().includes(needle) ||
      (p.barcode ?? "").toLowerCase().includes(needle),
  );
}

/** Optimistic local-only decrement so a second offline sale in the same
 * session sees reduced stock, the server re-checks for real at sync time. */
export async function decrementCachedStock(
  businessId: string,
  productId: string,
  quantity: number,
) {
  const db = await getDb();
  const product = await db.get("products", productId);
  if (!product || product.businessId !== businessId) return;
  await db.put("products", { ...product, stock: Math.max(product.stock - quantity, 0) });
}

export async function addPendingSale(sale: PendingSale) {
  const db = await getDb();
  await db.put("pendingSales", sale);
}

export async function listPendingSales(businessId: string): Promise<PendingSale[]> {
  const db = await getDb();
  const sales = await db.getAllFromIndex("pendingSales", "by-business", businessId);
  return sales.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function updatePendingSale(localId: string, patch: Partial<PendingSale>) {
  const db = await getDb();
  const existing = await db.get("pendingSales", localId);
  if (!existing) return;
  await db.put("pendingSales", { ...existing, ...patch });
}

export async function removePendingSale(localId: string) {
  const db = await getDb();
  await db.delete("pendingSales", localId);
}

export function shouldPersistPosDraft(cartLength: number): boolean {
  return cartLength > 0;
}

export async function savePosDraft(draft: PosDraft) {
  const db = await getDb();
  if (!shouldPersistPosDraft(draft.cart.length)) {
    await db.delete("posDrafts", draft.businessId);
    return;
  }
  await db.put("posDrafts", draft);
}

export async function getPosDraft(businessId: string): Promise<PosDraft | undefined> {
  const db = await getDb();
  return db.get("posDrafts", businessId);
}

export async function clearPosDraft(businessId: string) {
  const db = await getDb();
  await db.delete("posDrafts", businessId);
}

/** Shared-device logout. Pending sales are not deleted until the cashier
 * confirms, because a network blip followed by sign-out must not destroy
 * unsynced cash sales. Product cache and the in-progress cart snapshot are
 * always dropped. */
export async function clearOfflineCacheOnLogout(businessId: string | null) {
  if (typeof indexedDB === "undefined") return;
  const db = await getDb();
  if (!businessId) {
    await db.clear("products");
    await db.clear("posDrafts");
    return;
  }
  const tx = db.transaction("products", "readwrite");
  const keys = await tx.store.index("by-business").getAllKeys(businessId);
  await Promise.all(keys.map((key) => tx.store.delete(key)));
  await tx.done;
  await db.delete("posDrafts", businessId);
}
