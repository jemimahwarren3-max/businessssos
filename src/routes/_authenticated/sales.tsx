import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Minus, Plus, Search, ShoppingCart, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
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
import { useWorkspace } from "@/hooks/use-workspace";
import { addSale, getCustomers, getProducts } from "@/lib/business.functions";
import { PAYMENT_METHODS, saleSchema, type LineItemInput } from "@/lib/business.schemas";
import { formatMoney, formatNumber, readableError } from "@/lib/format";
import { computeTotals } from "@/lib/invoice-calc";

export const Route = createFileRoute("/_authenticated/sales")({
  head: () => ({
    meta: [
      { title: "Sales — BusinessOS AI" },
      {
        name: "description",
        content: "Ring up a sale, take payment, and update stock automatically.",
      },
      { property: "og:title", content: "Sales — BusinessOS AI" },
      { property: "og:description", content: "The fastest way to sell." },
    ],
  }),
  component: Sales,
});

const SELL_ROLES = ["owner", "admin", "manager", "cashier"];
const NONE = "__none";

type CartItem = {
  productId: string;
  name: string;
  sku: string | null;
  unitPrice: number;
  taxRate: number;
  quantity: number;
  stock: number;
};

function toLineItems(cart: CartItem[]): LineItemInput[] {
  return cart.map((item) => ({
    productId: item.productId,
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    taxRate: item.taxRate,
  }));
}

function Sales() {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  const businessId = workspace.data?.business.id;
  const currency = workspace.data?.business.currency ?? "USD";
  const role = workspace.data?.role ?? "";
  const canSell = SELL_ROLES.includes(role);

  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [discount, setDiscount] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [receipt, setReceipt] = useState<{ number: string; total: number } | null>(null);
  // Stays the same across a failed submit so a retry can't double-book the sale;
  // only rotates once the sale actually succeeds or the cart is cleared.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const fetchProducts = useServerFn(getProducts);
  const fetchCustomers = useServerFn(getCustomers);
  const createSaleFn = useServerFn(addSale);

  useEffect(() => {
    if (!workspace.isLoading && workspace.data === null) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [workspace.isLoading, workspace.data, navigate]);

  const products = useQuery({
    queryKey: ["products", businessId, search],
    enabled: Boolean(businessId) && search.trim().length > 0,
    queryFn: () => fetchProducts({ data: { businessId: businessId!, search } }),
  });

  const customers = useQuery({
    queryKey: ["customers", businessId, ""],
    enabled: Boolean(businessId),
    queryFn: () => fetchCustomers({ data: { businessId: businessId!, search: "" } }),
  });

  function addToCart(product: {
    id: string;
    name: string;
    sku: string | null;
    selling_price: number;
    tax_rate: number;
    stock: number;
  }) {
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
    const rows = products.data ?? [];
    if (rows.length === 1 && rows[0]) {
      event.preventDefault();
      addToCart(rows[0]);
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

  async function resetAfterSale() {
    setCart([]);
    setDiscount("0");
    setCustomerId("");
    setPaymentMethod("cash");
    setIdempotencyKey(crypto.randomUUID());
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
        paymentMethod,
        items: cart.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
        idempotencyKey,
      });
      return createSaleFn({ data: parsed });
    },
    onSuccess: async (result) => {
      toast.success("Sale completed.");
      setReceipt({ number: result.id.slice(0, 8), total: totals.total });
      await resetAfterSale();
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

  const results = products.data ?? [];

  return (
    <AppShell
      businessName={workspace.data.business.name}
      role={workspace.data.role}
      plan={workspace.data.plan}
      title="Sales counter"
      subtitle="Search or scan a product, adjust the cart, then take payment."
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="order-2 space-y-4 lg:order-1">
          <div className="relative">
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

          <div className="surface overflow-hidden">
            {!search.trim() ? (
              <div className="px-6 py-16 text-center text-sm text-muted-foreground">
                Start typing a product name, SKU, or scan a barcode to add it to the cart.
              </div>
            ) : products.isLoading ? (
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
                            {stock <= 0
                              ? "Out of stock"
                              : `${formatNumber(stock)} ${product.unit} left`}
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
                onClick={() => setCart([])}
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
              <Label>Customer (optional)</Label>
              <Select value={customerId || NONE} onValueChange={setCustomerId}>
                <SelectTrigger>
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

            <div className="grid grid-cols-2 gap-3">
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
              <div className="space-y-1.5">
                <Label>Payment</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {paymentMethod === "credit" && !customerId ? (
              <p className="text-[13px] text-warning-foreground">
                Select a customer for credit sales — it's added to what they owe.
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
                cart.length === 0 ||
                (paymentMethod === "credit" && !customerId)
              }
            >
              {saleMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              Complete sale · {formatMoney(totals.total, currency)}
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={Boolean(receipt)} onOpenChange={(open) => !open && setReceipt(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Sale complete</DialogTitle>
            <DialogDescription>
              Receipt {receipt?.number} · {receipt ? formatMoney(receipt.total, currency) : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button className="w-full" onClick={() => setReceipt(null)}>
              New sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
