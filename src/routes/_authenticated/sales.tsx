import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  Camera,
  History,
  Loader2,
  MessageCircle,
  Minus,
  Plus,
  Printer,
  RefreshCw,
  Search,
  ShoppingCart,
  Trash2,
  WifiOff,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { BarcodeScannerDialog } from "@/components/barcode-scanner-dialog";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { SaleReceiptPrintView, type SaleReceiptProps } from "@/components/sale-receipt-print-view";
import { useDebounce } from "@/hooks/use-debounce";
import { hasPermission, useWorkspace } from "@/hooks/use-workspace";
import { addSale, getCashDrawerFn, getCustomers, getProducts } from "@/lib/business.functions";
import { formatMoney, formatNumber, readableError } from "@/lib/format";
import {
  POS_PAYMENT_RAILS,
  paymentRailLabel,
  railToPaymentMethod,
  tendersAllocated,
  tendersLabel,
  tendersNeedCashDrawer,
  tendersNeedCustomer,
} from "@/lib/payment-rails";
import { CURRENCIES, saleSchema, type LineItemInput } from "@/lib/business.schemas";
import { buildSaleReceiptWhatsAppMessage, buildWhatsAppShareUrl } from "@/lib/whatsapp";
import { computeTotals } from "@/lib/invoice-calc";
import {
  addPendingSale,
  clearPosDraft,
  decrementCachedStock,
  getPosDraft,
  listPendingSales,
  removePendingSale,
  replaceCachedProducts,
  savePosDraft,
  searchCachedProducts,
  upsertCachedProducts,
  type CachedProduct,
  type PendingSale,
  type PosDraftCartItem,
  type PosDraftTender,
} from "@/lib/offline/db";
import { syncOnePendingSale, syncPendingSales } from "@/lib/offline/sync";
import { formatStockLeftLabel, OFFLINE_STOCK_HINT } from "@/lib/offline/stock-label";
import { useOnlineStatus } from "@/lib/offline/use-online-status";

export const Route = createFileRoute("/_authenticated/sales")({
  head: () => ({
    meta: [
      { title: "Sales | Kwetuu" },
      {
        name: "description",
        content: "Ring up a sale, take payment, and update stock automatically.",
      },
      { property: "og:title", content: "Sales | Kwetuu" },
      { property: "og:description", content: "The fastest way to sell." },
    ],
  }),
  component: Sales,
});

const NONE = "__none";

type TenderDraft = PosDraftTender;

function newTenderDraft(rail: string, amount: string, currency: string): TenderDraft {
  return {
    key: crypto.randomUUID(),
    rail,
    amount,
    currency,
    amountOriginal: "",
    showOriginal: false,
  };
}

type CartItem = PosDraftCartItem;

function toLineItems(cart: CartItem[]): LineItemInput[] {
  return cart.map((item) => ({
    productId: item.productId,
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    taxRate: item.taxRate,
  }));
}

// Shape shared by both the live server search results and the offline cache,
// so addToCart and the results list work the same regardless of source.
type SearchResultProduct = {
  id: string;
  name: string;
  sku: string | null;
  barcode?: string | null;
  unit: string;
  selling_price: number;
  tax_rate: number;
  stock: number;
};

function toCachedProduct(businessId: string, product: SearchResultProduct): CachedProduct {
  return {
    id: product.id,
    businessId,
    name: product.name,
    sku: product.sku,
    barcode: product.barcode ?? null,
    unit: product.unit,
    selling_price: Number(product.selling_price),
    tax_rate: Number(product.tax_rate),
    stock: Number(product.stock),
    cachedAt: new Date().toISOString(),
  };
}

function Sales() {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  const businessId = workspace.data?.business.id;
  const currency = workspace.data?.business.currency ?? "USD";
  const canSell = hasPermission(workspace.data, "sales.create");

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [discount, setDiscount] = useState("0");
  const [paymentRail, setPaymentRail] = useState("cash");
  const [splitPay, setSplitPay] = useState(false);
  const [tenders, setTenders] = useState<TenderDraft[]>([]);
  const [receipt, setReceipt] = useState<{
    number: string;
    total: number;
    offline: boolean;
    printData: SaleReceiptProps | null;
    customerPhone: string | null;
  } | null>(null);
  // Stays the same across a failed submit so a retry can't double-book the sale;
  // only rotates once the sale actually succeeds or the cart is cleared.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [draftReady, setDraftReady] = useState(false);
  const [restoredBanner, setRestoredBanner] = useState(false);

  const isOnline = useOnlineStatus();
  const fetchProducts = useServerFn(getProducts);
  const fetchCustomers = useServerFn(getCustomers);
  const createSaleFn = useServerFn(addSale);
  const loadDrawer = useServerFn(getCashDrawerFn);

  useEffect(() => {
    if (!workspace.isLoading && workspace.data === null) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [workspace.isLoading, workspace.data, navigate]);

  const drawer = useQuery({
    queryKey: ["cash-drawer", businessId],
    enabled: Boolean(businessId) && isOnline,
    queryFn: () => loadDrawer({ data: { businessId: businessId! } }),
  });
  const cashDrawerOpen = drawer.data?.open === true;

  const products = useQuery({
    queryKey: ["products", businessId, debouncedSearch],
    enabled: Boolean(businessId) && isOnline && debouncedSearch.trim().length > 0,
    queryFn: () => fetchProducts({ data: { businessId: businessId!, search: debouncedSearch } }),
  });

  // Offline fallback for the same search, read from whatever was cached
  // while last online.
  const offlineProducts = useQuery({
    queryKey: ["offline-products", businessId, debouncedSearch],
    enabled: Boolean(businessId) && !isOnline && debouncedSearch.trim().length > 0,
    queryFn: () => searchCachedProducts(businessId!, debouncedSearch),
  });

  // One-time-per-mount broad snapshot so offline search has more to work with
  // than just whatever the user happens to search for while still online.
  const cacheSeed = useQuery({
    queryKey: ["products-cache-seed", businessId],
    enabled: Boolean(businessId) && isOnline,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const rows = await fetchProducts({ data: { businessId: businessId!, search: "" } });
      await replaceCachedProducts(
        businessId!,
        rows.map((row) => toCachedProduct(businessId!, row)),
      );
      return rows.length;
    },
  });

  // Every live search result also gets folded into the cache so specific
  // products the cashier actually looked up stay available offline too.
  useEffect(() => {
    if (!isOnline || !businessId || !products.data) return;
    void upsertCachedProducts(
      businessId,
      products.data.map((row) => toCachedProduct(businessId, row)),
    );
  }, [isOnline, businessId, products.data]);

  const pendingSales = useQuery({
    queryKey: ["pending-sales", businessId],
    enabled: Boolean(businessId),
    queryFn: () => listPendingSales(businessId!),
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    setDraftReady(false);
    void (async () => {
      try {
        const draft = await getPosDraft(businessId);
        if (cancelled) return;
        if (draft && draft.cart.length > 0) {
          setCart(draft.cart);
          setCustomerId(draft.customerId);
          setDiscount(draft.discount);
          setPaymentRail(draft.paymentRail);
          setSplitPay(draft.splitPay);
          setTenders(draft.tenders);
          setRestoredBanner(true);
        }
      } catch {
        // Private browsing / IndexedDB blocked — POS still works in memory.
      } finally {
        if (!cancelled) setDraftReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  useEffect(() => {
    if (!businessId || !draftReady) return;
    const handle = window.setTimeout(() => {
      if (cart.length === 0) {
        void clearPosDraft(businessId).catch(() => undefined);
        return;
      }
      void savePosDraft({
        businessId,
        cart,
        customerId,
        discount,
        paymentRail,
        splitPay,
        tenders,
        updatedAt: new Date().toISOString(),
      }).catch(() => undefined);
    }, 400);
    return () => window.clearTimeout(handle);
  }, [businessId, draftReady, cart, customerId, discount, paymentRail, splitPay, tenders]);

  async function submitQueuedSale(sale: PendingSale) {
    const parsed = saleSchema.parse({
      businessId: sale.businessId,
      customerId: sale.customerId,
      discount: sale.discount,
      paymentMethod: sale.paymentMethod,
      rail: sale.rail ?? sale.paymentMethod,
      tenders: sale.tenders,
      items: sale.items,
      idempotencyKey: sale.idempotencyKey,
    });
    return createSaleFn({ data: parsed });
  }

  async function runSync(currentBusinessId: string) {
    const result = await syncPendingSales(currentBusinessId, submitQueuedSale);
    if (result.synced > 0) {
      toast.success(`Synced ${result.synced} offline sale${result.synced === 1 ? "" : "s"}.`);
    }
    if (result.failed > 0) {
      toast.error(
        `${result.failed} offline sale${result.failed === 1 ? "" : "s"} couldn't sync, review below.`,
      );
    }
    await queryClient.invalidateQueries({ queryKey: ["pending-sales"] });
    await queryClient.invalidateQueries({ queryKey: ["products"] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    await queryClient.invalidateQueries({ queryKey: ["customers"] });
    return result;
  }

  // Auto-sync the moment connectivity returns.
  useEffect(() => {
    if (!isOnline || !businessId) return;
    let cancelled = false;
    async function run() {
      const queue = await listPendingSales(businessId!);
      if (queue.length === 0 || cancelled) return;
      await runSync(businessId!);
    }
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, businessId]);

  const syncMutation = useMutation({
    mutationFn: () => runSync(businessId!),
  });

  const discardPendingMutation = useMutation({
    mutationFn: (localId: string) => removePendingSale(localId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pending-sales"] }),
  });

  const retryOneMutation = useMutation({
    mutationFn: (localId: string) => syncOnePendingSale(businessId!, localId, submitQueuedSale),
    onSuccess: async (result) => {
      if (result.synced > 0) toast.success("Sale synced.");
      if (result.failed > 0) {
        toast.error("This sale still couldn't sync, review below.");
      }
      await queryClient.invalidateQueries({ queryKey: ["pending-sales"] });
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });

  const customers = useQuery({
    queryKey: ["customers", businessId, ""],
    enabled: Boolean(businessId),
    queryFn: () => fetchCustomers({ data: { businessId: businessId!, search: "" } }),
  });

  function addToCart(product: SearchResultProduct) {
    if (!draftReady) return;
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing) {
        return prev.map((item) =>
          item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          sku: product.sku,
          unitPrice: Number(product.selling_price),
          taxRate: Number(product.tax_rate),
          quantity: 1,
          stock: Number(product.stock),
        },
      ];
    });
    setSearch("");
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    const rows = isOnline ? (products.data ?? []) : (offlineProducts.data ?? []);
    if (rows.length === 1 && rows[0]) {
      event.preventDefault();
      addToCart(rows[0]);
    }
  }

  // A camera scan is a one-shot lookup, not a reactive search — done as a
  // direct fetch rather than routing through the `search` state, since
  // updating `search` and waiting for the query to catch up would need its
  // own effect just to know when the scan's answer has actually arrived.
  async function handleBarcodeDetected(code: string) {
    if (!businessId) return;
    try {
      const results = isOnline
        ? await fetchProducts({ data: { businessId, search: code } })
        : await searchCachedProducts(businessId, code);
      const match = results.find((p) => p.barcode === code);
      if (match) {
        if (!draftReady) return;
        addToCart(match);
        toast.success(`Added ${match.name}`);
      } else {
        toast.error("No product found with that barcode.");
      }
    } catch {
      toast.error("Couldn't look up that barcode. Please try again.");
    }
  }

  function updateQuantity(productId: string, quantity: number) {
    if (quantity <= 0) {
      setCart((prev) => prev.filter((item) => item.productId !== productId));
      return;
    }
    setCart((prev) =>
      prev.map((item) => (item.productId === productId ? { ...item, quantity } : item)),
    );
  }

  const totals = useMemo(
    () => computeTotals(toLineItems(cart), Number(discount) || 0),
    [cart, discount],
  );

  const activeTenders = useMemo((): {
    rail: string;
    amount: number;
    currency: string;
    amountOriginal?: number;
  }[] => {
    if (splitPay) {
      return tenders.map((tender) => {
        const row: {
          rail: string;
          amount: number;
          currency: string;
          amountOriginal?: number;
        } = {
          rail: tender.rail,
          amount: Number(tender.amount) || 0,
          currency: tender.showOriginal && tender.currency ? tender.currency : currency,
        };
        if (tender.showOriginal && tender.amountOriginal) {
          row.amountOriginal = Number(tender.amountOriginal);
        }
        return row;
      });
    }
    return [{ rail: paymentRail, amount: totals.total, currency }];
  }, [splitPay, tenders, paymentRail, totals.total, currency]);

  const remaining = Math.round((totals.total - tendersAllocated(activeTenders)) * 100) / 100;
  const needsDrawer = tendersNeedCashDrawer(activeTenders);
  const needsCustomer = tendersNeedCustomer(activeTenders);
  const hasUnconfirmedRail = activeTenders.some(
    (tender) => tender.rail === "ecocash" || tender.rail === "innbucks" || tender.rail === "zipit",
  );

  async function resetAfterSale() {
    setCart([]);
    setDiscount("0");
    setCustomerId("");
    setPaymentRail("cash");
    setSplitPay(false);
    setTenders([]);
    setIdempotencyKey(crypto.randomUUID());
    setRestoredBanner(false);
    if (businessId) await clearPosDraft(businessId).catch(() => undefined);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["products"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      queryClient.invalidateQueries({ queryKey: ["customers"] }),
    ]);
  }

  const saleMutation = useMutation({
    mutationFn: async () => {
      const parsed = saleSchema.parse({
        businessId,
        customerId: customerId === NONE ? "" : customerId,
        discount: discount || 0,
        paymentMethod: railToPaymentMethod(activeTenders[0]?.rail ?? paymentRail),
        rail: activeTenders[0]?.rail ?? paymentRail,
        tenders: activeTenders.map((tender) => {
          const row: {
            rail: string;
            amount: number;
            currency: string;
            amountOriginal?: number;
          } = {
            rail: tender.rail,
            amount: tender.amount,
            currency: tender.currency,
          };
          if (tender.amountOriginal) row.amountOriginal = tender.amountOriginal;
          return row;
        }),
        items: cart.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
        idempotencyKey,
      });

      if (!isOnline) {
        const pending: PendingSale = {
          localId: crypto.randomUUID(),
          businessId: parsed.businessId,
          idempotencyKey: parsed.idempotencyKey,
          customerId: parsed.customerId ?? "",
          discount: parsed.discount,
          paymentMethod: parsed.paymentMethod,
          items: parsed.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
          createdAt: new Date().toISOString(),
          status: "pending",
        };
        if (parsed.rail) pending.rail = parsed.rail;
        if (parsed.tenders && parsed.tenders.length > 0) {
          pending.tenders = parsed.tenders.map((tender) => {
            const row: NonNullable<PendingSale["tenders"]>[number] = {
              rail: tender.rail,
              amount: tender.amount,
            };
            if (tender.currency) row.currency = tender.currency;
            if (tender.amountOriginal) row.amountOriginal = tender.amountOriginal;
            return row;
          });
        }
        await addPendingSale(pending);
        for (const item of parsed.items) {
          if (item.productId) {
            await decrementCachedStock(parsed.businessId, item.productId, item.quantity);
          }
        }
        return { id: "", offline: true as const };
      }

      const result = await createSaleFn({ data: parsed });
      return { id: result.id, offline: false as const };
    },
    onSuccess: async (result) => {
      const methodLabel = tendersLabel(activeTenders, paymentRailLabel(paymentRail));
      const printData: SaleReceiptProps = {
        businessName: workspace.data?.business.name ?? "",
        receiptNumber: result.offline ? "Pending" : result.id.slice(0, 8),
        date: new Date().toISOString(),
        paymentMethod: methodLabel,
        items: cart.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.unitPrice * item.quantity,
        })),
        subtotal: totals.subtotal,
        discount: Number(discount) || 0,
        tax: totals.tax,
        total: totals.total,
        currency,
        customerName: customers.data?.find((c) => c.id === customerId)?.name,
      };
      const customerPhone = customers.data?.find((c) => c.id === customerId)?.phone ?? null;
      if (result.offline) {
        toast.success("Sale saved offline, it'll sync automatically once you're back online.");
        setReceipt({
          number: "Pending sync",
          total: totals.total,
          offline: true,
          printData,
          customerPhone,
        });
      } else {
        toast.success("Sale completed.");
        setReceipt({
          number: result.id.slice(0, 8),
          total: totals.total,
          offline: false,
          printData,
          customerPhone,
        });
      }
      await resetAfterSale();
      await queryClient.invalidateQueries({ queryKey: ["pending-sales"] });
    },
    onError: (error: Error) => toast.error(readableError(error, "We couldn't complete that sale.")),
  });

  if (!workspace.data) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (!canSell) {
    return (
      <AppShell
        businessName={workspace.data.business.name}
        role={workspace.data.role}
        plan={workspace.data.plan}
        isReadOnly={workspace.data.isReadOnly}
        billingEnabled={workspace.data.billingEnabled}
        title="Sales"
        subtitle="Ring up a sale in a few taps."
      >
        <div className="surface px-6 py-16 text-center">
          <ShoppingCart className="mx-auto size-9 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-semibold">Your role can't record sales</h2>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
            Ask an owner, admin or manager to change your role if you need to sell from here.
          </p>
        </div>
      </AppShell>
    );
  }

  const results = isOnline ? (products.data ?? []) : (offlineProducts.data ?? []);
  const resultsLoading = isOnline ? products.isLoading : offlineProducts.isLoading;
  const pendingList = pendingSales.data ?? [];
  const failedList = pendingList.filter((sale) => sale.status === "failed");
  const waitingList = pendingList.filter((sale) => sale.status !== "failed");

  return (
    <AppShell
      businessName={workspace.data.business.name}
      role={workspace.data.role}
      plan={workspace.data.plan}
      isReadOnly={workspace.data.isReadOnly}
      billingEnabled={workspace.data.billingEnabled}
      title="Sales counter"
      subtitle="Search or scan a product, adjust the cart, then take payment."
      actions={
        <Button
          variant="outline"
          className="gap-1.5"
          onClick={() => navigate({ to: "/sale-history" })}
        >
          <History className="size-4" aria-hidden="true" /> History
        </Button>
      }
    >
      {restoredBanner ? (
        <div className="surface mb-4 flex items-start justify-between gap-3 border-warning/40 bg-warning-soft p-3.5 text-[13px] text-warning-foreground">
          <p>Restored cart from before the power cut. Check it before charging.</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 text-warning-foreground"
            onClick={() => setRestoredBanner(false)}
          >
            Dismiss
          </Button>
        </div>
      ) : null}

      {!isOnline ? (
        <div className="surface mb-4 flex items-center gap-2.5 border-warning/40 bg-warning-soft p-3.5 text-[13px] text-warning-foreground">
          <WifiOff className="size-4 shrink-0" aria-hidden="true" />
          You're offline. Sales are saved on this device and will sync automatically once you're
          back online. {OFFLINE_STOCK_HINT}.
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="order-2 space-y-4 lg:order-1">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search by name, SKU or scan a barcode"
                className="pl-9"
                aria-label="Search products"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Scan a barcode with the camera"
              onClick={() => setScannerOpen(true)}
            >
              <Camera className="size-4" aria-hidden="true" />
            </Button>
          </div>

          <div className="surface overflow-hidden">
            {businessId && !draftReady ? (
              <div className="px-6 py-16 text-center text-sm text-muted-foreground">
                Checking for a saved cart…
              </div>
            ) : !search.trim() ? (
              <div className="px-6 py-16 text-center text-sm text-muted-foreground">
                Start typing a product name, SKU, or scan a barcode to add it to the cart.
              </div>
            ) : resultsLoading ? (
              <div className="space-y-3 p-5">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : results.length === 0 ? (
              <div className="px-6 py-16 text-center text-sm text-muted-foreground">
                No products match "{search}".
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {!isOnline ? (
                  <li className="px-5 py-2 text-[12px] text-muted-foreground">
                    {OFFLINE_STOCK_HINT}.
                  </li>
                ) : null}
                {results.map((product) => {
                  const stock = Number(product.stock);
                  return (
                    <li key={product.id}>
                      <button
                        type="button"
                        onClick={() => addToCart(product)}
                        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-3.5 text-left hover:bg-muted/40"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{product.name}</p>
                          <p className="truncate text-[13px] text-muted-foreground">
                            {product.sku ? `${product.sku} · ` : ""}
                            {formatStockLeftLabel(stock, product.unit, formatNumber, !isOnline)}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">
                          {formatMoney(Number(product.selling_price), currency)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="surface order-1 space-y-4 p-4 lg:order-2 lg:sticky lg:top-20 lg:h-fit">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Cart</h2>
            {cart.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-muted-foreground"
                onClick={() => {
                  setCart([]);
                  setRestoredBanner(false);
                  if (businessId) void clearPosDraft(businessId).catch(() => undefined);
                }}
              >
                <Trash2 className="size-3.5" aria-hidden="true" /> Clear
              </Button>
            ) : null}
          </div>

          {cart.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Add products to start a sale.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {cart.map((item) => (
                <li key={item.productId} className="rounded-lg border border-border p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-medium">{item.name}</p>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {formatMoney(
                        item.unitPrice * item.quantity * (1 + item.taxRate / 100),
                        currency,
                      )}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className="text-[13px] text-muted-foreground">
                      {formatMoney(item.unitPrice, currency)} each
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-7"
                        onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                        aria-label="Decrease quantity"
                      >
                        <Minus className="size-3.5" aria-hidden="true" />
                      </Button>
                      <span className="w-8 text-center text-sm font-medium tabular-nums">
                        {formatNumber(item.quantity)}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-7"
                        onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                        aria-label="Increase quantity"
                      >
                        <Plus className="size-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-3 border-t border-border pt-3">
            <div className="space-y-1.5">
              <Label htmlFor="sale-customer">Customer (optional)</Label>
              <Select value={customerId || NONE} onValueChange={setCustomerId}>
                <SelectTrigger id="sale-customer">
                  <SelectValue placeholder="Walk-in customer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Walk-in customer</SelectItem>
                  {(customers.data ?? []).map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sale-discount">Discount</Label>
              <Input
                id="sale-discount"
                type="number"
                min={0}
                step="0.01"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </div>

            {!splitPay ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="sale-payment">Payment</Label>
                  <button
                    type="button"
                    className="text-[12px] text-muted-foreground underline"
                    onClick={() => {
                      setTenders([
                        newTenderDraft(
                          paymentRail,
                          totals.total ? String(totals.total) : "",
                          currency,
                        ),
                      ]);
                      setSplitPay(true);
                    }}
                  >
                    Split payment
                  </button>
                </div>
                <Select value={paymentRail} onValueChange={setPaymentRail}>
                  <SelectTrigger id="sale-payment">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {POS_PAYMENT_RAILS.map((rail) => (
                      <SelectItem key={rail.value} value={rail.value}>
                        {rail.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Split payment</Label>
                  <button
                    type="button"
                    className="text-[12px] text-muted-foreground underline"
                    onClick={() => {
                      setPaymentRail(tenders[0]?.rail ?? "cash");
                      setSplitPay(false);
                      setTenders([]);
                    }}
                  >
                    One method
                  </button>
                </div>
                <ul className="space-y-2">
                  {tenders.map((tender) => {
                    const used = new Set(tenders.map((row) => row.rail));
                    return (
                      <li
                        key={tender.key}
                        className="space-y-1.5 rounded-lg border border-border p-2.5"
                      >
                        <div className="grid grid-cols-[1fr_auto] gap-2">
                          <Select
                            value={tender.rail}
                            onValueChange={(value) =>
                              setTenders((prev) =>
                                prev.map((row) =>
                                  row.key === tender.key ? { ...row, rail: value } : row,
                                ),
                              )
                            }
                          >
                            <SelectTrigger aria-label="Payment method">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {POS_PAYMENT_RAILS.filter(
                                (rail) => rail.value === tender.rail || !used.has(rail.value),
                              ).map((rail) => (
                                <SelectItem key={rail.value} value={rail.value}>
                                  {rail.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {tenders.length > 1 ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-9 text-muted-foreground"
                              aria-label="Remove method"
                              onClick={() =>
                                setTenders((prev) => prev.filter((row) => row.key !== tender.key))
                              }
                            >
                              <Trash2 className="size-3.5" aria-hidden="true" />
                            </Button>
                          ) : null}
                        </div>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          inputMode="decimal"
                          aria-label={`${paymentRailLabel(tender.rail)} amount`}
                          value={tender.amount}
                          onChange={(e) =>
                            setTenders((prev) =>
                              prev.map((row) =>
                                row.key === tender.key ? { ...row, amount: e.target.value } : row,
                              ),
                            )
                          }
                        />
                        <Hint
                          tip={
                            tender.showOriginal
                              ? "Hide the original amount and currency."
                              : "Record this tender using a different currency."
                          }
                        >
                          <button
                            type="button"
                            className="text-[12px] text-muted-foreground underline"
                            onClick={() =>
                              setTenders((prev) =>
                                prev.map((row) =>
                                  row.key === tender.key
                                    ? { ...row, showOriginal: !row.showOriginal }
                                    : row,
                                ),
                              )
                            }
                          >
                            {tender.showOriginal
                              ? "Hide other currency"
                              : "Recorded as another currency"}
                          </button>
                        </Hint>
                        {tender.showOriginal ? (
                          <div className="grid grid-cols-2 gap-2">
                            <Select
                              value={tender.currency}
                              onValueChange={(value) =>
                                setTenders((prev) =>
                                  prev.map((row) =>
                                    row.key === tender.key ? { ...row, currency: value } : row,
                                  ),
                                )
                              }
                            >
                              <Hint tip="Select the currency the customer handed over.">
                                <SelectTrigger aria-label="Recorded currency">
                                  <SelectValue />
                                </SelectTrigger>
                              </Hint>
                              <SelectContent>
                                {CURRENCIES.map((code) => (
                                  <SelectItem key={code} value={code}>
                                    {code === "ZWG" ? "ZiG" : code}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              inputMode="decimal"
                              aria-label="Original amount"
                              placeholder="Amount handed over"
                              value={tender.amountOriginal}
                              onChange={(e) =>
                                setTenders((prev) =>
                                  prev.map((row) =>
                                    row.key === tender.key
                                      ? { ...row, amountOriginal: e.target.value }
                                      : row,
                                  ),
                                )
                              }
                            />
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
                {tenders.length < POS_PAYMENT_RAILS.length ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      const used = new Set(tenders.map((row) => row.rail));
                      const next = POS_PAYMENT_RAILS.find((rail) => !used.has(rail.value));
                      if (!next) return;
                      const leftover = remaining > 0 ? String(remaining) : "";
                      setTenders((prev) => [
                        ...prev,
                        newTenderDraft(next.value, leftover, currency),
                      ]);
                    }}
                  >
                    <Plus className="size-3.5" aria-hidden="true" /> Add method
                  </Button>
                ) : null}
                <div className="flex justify-between text-[13px]">
                  <span className="text-muted-foreground">Left to allocate</span>
                  <span
                    className={`tabular-nums font-medium ${remaining === 0 ? "text-foreground" : "text-warning-foreground"}`}
                  >
                    {formatMoney(remaining, currency)}
                  </span>
                </div>
                <p className="text-[12px] text-muted-foreground">
                  Amounts in another currency are stored as typed. Kwetuu does not convert USD and
                  ZiG.
                </p>
              </div>
            )}

            {needsCustomer && !customerId ? (
              <p className="text-[13px] text-warning-foreground">
                Select a customer for credit sales, it's added to what they owe.
              </p>
            ) : null}
            {needsDrawer && isOnline && !cashDrawerOpen ? (
              <p className="text-[13px] text-warning-foreground">
                Open the{" "}
                <Link to="/cash-drawer" className="underline">
                  cash drawer
                </Link>{" "}
                before taking cash. EcoCash, InnBucks, ZIPIT, bank, card and credit still work, and
                only the cash part goes in the till.
              </p>
            ) : null}
            {needsDrawer && !isOnline ? (
              <p className="text-[13px] text-warning-foreground">
                This cash sale will sync after you open the cash drawer.
              </p>
            ) : null}
            {hasUnconfirmedRail ? (
              <p className="text-[12px] text-muted-foreground">
                Recording EcoCash, InnBucks or ZIPIT here does not confirm the money arrived. Check
                the customer&apos;s statement before you treat it as paid.
              </p>
            ) : null}

            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatMoney(totals.subtotal, currency)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Tax</span>
                <span className="tabular-nums">{formatMoney(totals.tax, currency)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Discount</span>
                <span className="tabular-nums">
                  -{formatMoney(Number(discount) || 0, currency)}
                </span>
              </div>
              <div className="flex justify-between border-t border-border pt-1.5 text-base font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatMoney(totals.total, currency)}</span>
              </div>
            </div>

            <Button
              className="w-full gap-1.5"
              size="lg"
              onClick={() => saleMutation.mutate()}
              disabled={
                saleMutation.isPending ||
                !draftReady ||
                cart.length === 0 ||
                (needsCustomer && !customerId) ||
                (needsDrawer && isOnline && !cashDrawerOpen) ||
                (splitPay &&
                  (remaining !== 0 || activeTenders.some((tender) => tender.amount <= 0)))
              }
            >
              {saleMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              Complete sale · {formatMoney(totals.total, currency)}
            </Button>
          </div>

          {failedList.length > 0 ? (
            <div className="space-y-2 border-t border-border pt-3">
              <h3 className="text-sm font-semibold">These sales need you ({failedList.length})</h3>
              <p className="text-[12px] text-muted-foreground">
                They stayed on this device. Retry after you fix the problem. No developer needed.
              </p>
              <ul className="space-y-1.5">
                {failedList.map((sale) => (
                  <li
                    key={sale.localId}
                    className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 p-2 text-[13px]"
                  >
                    <div className="min-w-0">
                      <p className="truncate">
                        {sale.items.length} item{sale.items.length === 1 ? "" : "s"} ·{" "}
                        {formatMoney(
                          sale.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0) -
                            sale.discount,
                          currency,
                        )}
                      </p>
                      <p className="flex items-center gap-1 text-destructive">
                        <AlertTriangle className="size-3 shrink-0" aria-hidden="true" />
                        {sale.isClosedDrawer ? (
                          <>
                            Open the{" "}
                            <Link to="/cash-drawer" className="underline">
                              cash drawer
                            </Link>
                            , then retry this sale.
                          </>
                        ) : (
                          (sale.error ?? "Couldn't sync")
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      {isOnline ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={retryOneMutation.isPending || syncMutation.isPending}
                          onClick={() => retryOneMutation.mutate(sale.localId)}
                        >
                          {retryOneMutation.isPending &&
                          retryOneMutation.variables === sale.localId ? (
                            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                          ) : (
                            <RefreshCw className="size-3.5" aria-hidden="true" />
                          )}
                          Retry this sale
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        disabled={discardPendingMutation.isPending}
                        onClick={() => discardPendingMutation.mutate(sale.localId)}
                      >
                        Discard
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {waitingList.length > 0 ? (
            <div className="space-y-2 border-t border-border pt-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Queued sales ({waitingList.length})</h3>
                {isOnline ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-muted-foreground"
                    disabled={syncMutation.isPending || retryOneMutation.isPending}
                    onClick={() => businessId && syncMutation.mutate()}
                  >
                    {syncMutation.isPending ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <RefreshCw className="size-3.5" aria-hidden="true" />
                    )}
                    Sync now
                  </Button>
                ) : null}
              </div>
              <ul className="space-y-1.5">
                {waitingList.map((sale) => (
                  <li
                    key={sale.localId}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border p-2 text-[13px]"
                  >
                    <div className="min-w-0">
                      <p className="truncate">
                        {sale.items.length} item{sale.items.length === 1 ? "" : "s"} ·{" "}
                        {formatMoney(
                          sale.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0) -
                            sale.discount,
                          currency,
                        )}
                      </p>
                      {sale.status === "syncing" ? (
                        <p className="text-muted-foreground">Syncing…</p>
                      ) : (
                        <p className="text-muted-foreground">Waiting to sync</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      <BarcodeScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onDetected={(code) => void handleBarcodeDetected(code)}
      />

      <Dialog open={Boolean(receipt)} onOpenChange={(open) => !open && setReceipt(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{receipt?.offline ? "Saved offline" : "Sale complete"}</DialogTitle>
            <DialogDescription>
              {receipt?.offline
                ? `Queued for sync · ${receipt ? formatMoney(receipt.total, currency) : ""}`
                : `Receipt ${receipt?.number} · ${receipt ? formatMoney(receipt.total, currency) : ""}`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            {receipt?.printData && !receipt.offline ? (
              <Button variant="outline" className="w-full gap-1.5" onClick={() => window.print()}>
                <Printer className="size-4" aria-hidden="true" /> Print receipt
              </Button>
            ) : null}
            {receipt?.printData && !receipt.offline ? (
              <Button variant="outline" className="w-full gap-1.5" asChild>
                <a
                  href={buildWhatsAppShareUrl(
                    buildSaleReceiptWhatsAppMessage({
                      businessName: receipt.printData.businessName,
                      receiptNumber: receipt.printData.receiptNumber,
                      items: receipt.printData.items,
                      total: receipt.printData.total,
                      currency: receipt.printData.currency,
                      paymentMethod: receipt.printData.paymentMethod,
                    }),
                    receipt.customerPhone,
                  )}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle className="size-4" aria-hidden="true" /> Send on WhatsApp
                </a>
              </Button>
            ) : null}
            <Button className="w-full" onClick={() => setReceipt(null)}>
              New sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {receipt?.printData ? (
        <div className="hidden print:block print-area">
          <SaleReceiptPrintView {...receipt.printData} />
        </div>
      ) : null}
    </AppShell>
  );
}
