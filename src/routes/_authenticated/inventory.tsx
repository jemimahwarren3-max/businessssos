import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, Loader2, Minus, Package, Plus, Search, Upload } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { DataTable, type ColumnDef } from "@/components/data-table";
import { ImportDialog } from "@/components/import-dialog";
import { ProductCreateForm } from "@/components/product-create-form";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  addProduct,
  getLocations,
  getProducts,
  getSuppliers,
  importProductsFn,
  updateStock,
  uploadProductImageFn,
} from "@/lib/business.functions";
import {
  productImportRowSchema,
  productSchema,
  type ProductImportRow,
} from "@/lib/business.schemas";
import { formatMoney, formatNumber, readableError } from "@/lib/format";
import { optimizeProductImage } from "@/lib/product-image-optimizer";
import type { ImportColumn } from "@/lib/spreadsheet";
import { downloadXlsx } from "@/lib/xlsx-export";

// Aliases are matched after lowercasing and stripping spaces/underscores/
// hyphens (see normalizeHeader in lib/spreadsheet.ts), so "Retail Price",
// "retail_price" and "RetailPrice" all normalize to the same "retailprice"
// candidate — only one form needs listing here. Terms below lean on common
// Southern African retail/stock-take vocabulary (SOH, retail price, VAT)
// since that's this app's actual user base, not just US/UK spreadsheet norms.
const PRODUCT_IMPORT_COLUMNS: ImportColumn[] = [
  { key: "name", label: "Name", required: true, aliases: ["product", "item", "productname"] },
  { key: "sku", label: "SKU", required: false, aliases: ["code", "productcode", "itemcode"] },
  { key: "barcode", label: "Barcode", required: false, aliases: ["upc", "ean"] },
  {
    key: "costPrice",
    label: "Cost Price",
    required: false,
    aliases: ["cost", "buyprice", "buyingprice", "wholesaleprice"],
  },
  {
    key: "sellingPrice",
    label: "Selling Price",
    required: false,
    aliases: ["price", "sellprice", "retailprice", "retail", "unitprice"],
  },
  {
    key: "stock",
    label: "Stock",
    required: false,
    aliases: ["quantity", "qty", "stockonhand", "soh", "onhand", "qtyonhand", "stockqty"],
  },
  {
    key: "minStock",
    label: "Min Stock",
    required: false,
    aliases: ["reorderlevel", "reorderpoint", "minimumstock", "minqty", "minquantity"],
  },
  { key: "unit", label: "Unit", required: false, aliases: ["uom", "units"] },
  { key: "taxRate", label: "Tax Rate", required: false, aliases: ["tax", "vat", "taxpercent"] },
];

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory | Kwetuu" },
      {
        name: "description",
        content: "Track products, stock levels, cost and selling prices, and restock alerts.",
      },
      { property: "og:title", content: "Inventory | Kwetuu" },
      { property: "og:description", content: "Know exactly what you have in stock." },
    ],
  }),
  component: Inventory,
});

type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  cost_price: number;
  selling_price: number;
  stock: number;
  min_stock: number;
  image_url: string | null;
};

function Inventory() {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  const businessId = workspace.data?.business.id;
  const currency = workspace.data?.business.currency ?? "USD";
  const canEdit = ["owner", "admin", "manager"].includes(workspace.data?.role ?? "");

  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [stockTarget, setStockTarget] = useState<{
    product: ProductRow;
    mode: "in" | "out";
  } | null>(null);
  const [stockQty, setStockQty] = useState("");
  const [stockReason, setStockReason] = useState("");

  const fetchProducts = useServerFn(getProducts);
  const fetchLocations = useServerFn(getLocations);
  const fetchSuppliers = useServerFn(getSuppliers);
  const createProduct = useServerFn(addProduct);
  const uploadPhoto = useServerFn(uploadProductImageFn);
  const adjustStock = useServerFn(updateStock);
  const importProductsRows = useServerFn(importProductsFn);

  useEffect(() => {
    if (!workspace.isLoading && workspace.data === null) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [workspace.isLoading, workspace.data, navigate]);

  const products = useQuery({
    queryKey: ["products", businessId, search],
    enabled: Boolean(businessId),
    queryFn: () => fetchProducts({ data: { businessId: businessId!, search } }),
  });

  const locations = useQuery({
    queryKey: ["locations", businessId],
    enabled: Boolean(businessId),
    queryFn: () => fetchLocations({ data: { businessId: businessId! } }),
  });

  const suppliers = useQuery({
    queryKey: ["suppliers", businessId],
    enabled: Boolean(businessId) && addOpen,
    queryFn: () => fetchSuppliers({ data: { businessId: businessId!, search: "" } }),
  });

  const addMutation = useMutation({
    mutationFn: async (input: { fields: Record<string, unknown>; photo: File | null }) => {
      const photo = input.photo ? await optimizeProductImage(input.photo) : null;
      const parsed = productSchema.parse({
        ...input.fields,
        businessId,
      });
      const created = await createProduct({ data: parsed });
      const productId = Array.isArray(created) ? created[0]?.id : created?.id;
      if (photo && productId) {
        const form = new FormData();
        form.set("businessId", businessId!);
        form.set("productId", productId);
        form.set("file", photo);
        await uploadPhoto({ data: form });
      }
      return created;
    },
    onSuccess: async () => {
      setAddOpen(false);
      toast.success("Product added.");
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: Error) => toast.error(readableError(error, "We couldn't add that product.")),
  });

  const stockMutation = useMutation({
    mutationFn: async () => {
      if (!stockTarget) throw new Error("No product selected");
      return adjustStock({
        data: {
          businessId: businessId!,
          productId: stockTarget.product.id,
          movementType: stockTarget.mode === "in" ? "stock_in" : "stock_out",
          quantity: stockQty,
          reason: stockReason,
        },
      });
    },
    onSuccess: async () => {
      setStockTarget(null);
      setStockQty("");
      setStockReason("");
      toast.success("Stock updated.");
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: Error) => toast.error(readableError(error, "We couldn't update the stock.")),
  });

  const rows = (products.data ?? []) as ProductRow[];
  const columns = useMemo<ColumnDef<ProductRow, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Product",
        cell: ({ row }) => (
          <div className="flex max-w-[280px] items-center gap-3">
            {row.original.image_url ? (
              <img
                src={row.original.image_url}
                alt=""
                className="size-10 shrink-0 rounded-md object-cover"
              />
            ) : (
              <span className="grid size-10 shrink-0 place-items-center rounded-md bg-muted text-[10px] text-muted-foreground">
                No photo
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate font-medium">{row.original.name}</p>
              <p className="text-[13px] text-muted-foreground">
                {row.original.sku ?? "No SKU"} · per {row.original.unit}
              </p>
            </div>
          </div>
        ),
      },
      {
        accessorKey: "cost_price",
        header: "Cost",
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">
            {formatMoney(Number(row.original.cost_price), currency)}
          </span>
        ),
      },
      {
        accessorKey: "selling_price",
        header: "Price",
        cell: ({ row }) => (
          <span className="font-medium tabular-nums">
            {formatMoney(Number(row.original.selling_price), currency)}
          </span>
        ),
      },
      {
        accessorKey: "stock",
        header: "Stock",
        cell: ({ row }) => <StockBadge product={row.original} />,
      },
      ...(canEdit
        ? [
            {
              id: "actions",
              header: () => <span className="block text-right">Actions</span>,
              enableSorting: false,
              cell: ({ row }) => (
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={() => setStockTarget({ product: row.original, mode: "in" })}
                  >
                    <Plus className="size-3.5" aria-hidden="true" /> In
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={() => setStockTarget({ product: row.original, mode: "out" })}
                  >
                    <Minus className="size-3.5" aria-hidden="true" /> Out
                  </Button>
                </div>
              ),
            } satisfies ColumnDef<ProductRow, unknown>,
          ]
        : []),
    ],
    [canEdit, currency],
  );

  if (!workspace.data) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  function exportExcel() {
    downloadXlsx("inventory", [
      {
        name: "Inventory",
        headers: ["Name", "SKU", "Unit", "Cost", "Price", "Stock", "Min stock"],
        rows: rows.map((p) => [
          p.name,
          p.sku ?? "",
          p.unit,
          p.cost_price,
          p.selling_price,
          p.stock,
          p.min_stock,
        ]),
      },
    ]);
  }

  return (
    <AppShell
      businessName={workspace.data.business.name}
      role={workspace.data.role}
      plan={workspace.data.plan}
      isReadOnly={workspace.data.isReadOnly}
      billingEnabled={workspace.data.billingEnabled}
      title="Inventory"
      subtitle="Totals on this page. Sales and stock changes use the default location. Moving stock between locations is not available yet."
      actions={
        <>
          {rows.length > 0 ? (
            <Button variant="outline" className="gap-1.5" onClick={exportExcel}>
              <Download className="size-4" aria-hidden="true" /> Export to Excel
            </Button>
          ) : null}
          {canEdit ? (
            <>
              <Button variant="outline" className="gap-1.5" onClick={() => setImportOpen(true)}>
                <Upload className="size-4" aria-hidden="true" /> Import
              </Button>
              <Button className="gap-1.5" onClick={() => setAddOpen(true)}>
                <Plus className="size-4" aria-hidden="true" /> Add product
              </Button>
            </>
          ) : null}
        </>
      }
    >
      <div className="relative max-w-sm">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, SKU or barcode"
          className="pl-9"
          aria-label="Search products"
        />
      </div>
      {locations.data && locations.data.length > 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Default location:{" "}
          {locations.data.find((l) => l.is_default)?.name ?? locations.data[0]?.name}
          {locations.data.length > 1
            ? `. ${locations.data.length} active locations. Stock numbers here are the total.`
            : ". Stock numbers here match this location."}
        </p>
      ) : null}

      <div className="surface mt-4 overflow-hidden">
        {products.isLoading ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Package className="mx-auto size-9 text-muted-foreground" aria-hidden="true" />
            <h2 className="mt-3 text-lg font-semibold">
              {search ? "No products match that search" : "No products yet"}
            </h2>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
              {search
                ? "Try a shorter search term."
                : "Add your first product and Kwetuu will start tracking stock, profit and restock alerts for you."}
            </p>
            {canEdit && !search ? (
              <Button className="mt-5 gap-1.5" onClick={() => setAddOpen(true)}>
                <Plus className="size-4" aria-hidden="true" /> Add your first product
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <ul className="divide-y divide-border lg:hidden">
              {rows.map((product) => (
                <li key={product.id} className="p-4">
                  <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt=""
                        className="size-12 rounded-md object-cover"
                      />
                    ) : (
                      <span className="grid size-12 place-items-center rounded-md bg-muted text-[10px] text-muted-foreground">
                        No photo
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{product.name}</p>
                      <p className="text-[13px] text-muted-foreground">
                        {product.sku ? `${product.sku} · ` : ""}
                        {formatMoney(Number(product.selling_price), currency)}
                      </p>
                    </div>
                    <StockBadge product={product} />
                  </div>
                  {canEdit ? (
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={() => setStockTarget({ product, mode: "in" })}
                      >
                        <Plus className="size-3.5" aria-hidden="true" /> Stock in
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={() => setStockTarget({ product, mode: "out" })}
                      >
                        <Minus className="size-3.5" aria-hidden="true" /> Stock out
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>

            <div className="hidden lg:block">
              <DataTable columns={columns} data={rows} caption="Inventory products" />
            </div>
          </>
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add a product</DialogTitle>
            <DialogDescription>
              Only the name and prices are required. You can edit everything later.
            </DialogDescription>
          </DialogHeader>
          <ProductCreateForm
            currency={currency}
            suppliers={suppliers.data ?? []}
            pending={addMutation.isPending}
            onCancel={() => setAddOpen(false)}
            onSubmit={(values, photo) =>
              addMutation.mutate({ fields: values as Record<string, unknown>, photo })
            }
          />
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(stockTarget)} onOpenChange={(open) => !open && setStockTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{stockTarget?.mode === "in" ? "Add stock" : "Remove stock"}</DialogTitle>
            <DialogDescription>
              {stockTarget
                ? `${stockTarget.product.name}, currently ${formatNumber(
                    Number(stockTarget.product.stock),
                  )} ${stockTarget.product.unit}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="s-qty">Quantity</Label>
              <Input
                id="s-qty"
                autoFocus
                inputMode="decimal"
                value={stockQty}
                onChange={(e) => setStockQty(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-reason">Reason (optional)</Label>
              <Input
                id="s-reason"
                value={stockReason}
                maxLength={240}
                onChange={(e) => setStockReason(e.target.value)}
                placeholder={stockTarget?.mode === "in" ? "New delivery" : "Damaged / expired"}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setStockTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => stockMutation.mutate()}
              disabled={stockMutation.isPending || Number(stockQty) <= 0}
              className="gap-1.5"
            >
              {stockMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              Update stock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportDialog<ProductImportRow>
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import products and opening stock"
        description="Upload a .csv or Excel spreadsheet (.xlsx) with product details and a Stock or SOH column. Opening quantities are recorded as stock-in movements."
        columns={PRODUCT_IMPORT_COLUMNS}
        templateFilename="products-template"
        parseRow={(record, rowNumber) => {
          const result = productImportRowSchema.safeParse({
            name: record["name"],
            sku: record["sku"],
            barcode: record["barcode"],
            unit: record["unit"] || "unit",
            costPrice: record["costPrice"] || 0,
            sellingPrice: record["sellingPrice"] || 0,
            stock: record["stock"] || 0,
            minStock: record["minStock"] || 0,
            taxRate: record["taxRate"] || 0,
          });
          if (!result.success) {
            return {
              rowNumber,
              ok: false,
              error: result.error.issues[0]?.message ?? "Invalid row",
            };
          }
          return {
            rowNumber,
            ok: true,
            value: result.data,
            summary: `${result.data.name}, ${formatNumber(result.data.stock)} ${result.data.unit} @ ${formatMoney(result.data.sellingPrice, currency)}`,
          };
        }}
        onImport={async (rows) => {
          const outcome = await importProductsRows({ data: { businessId: businessId!, rows } });
          await queryClient.invalidateQueries({ queryKey: ["products"] });
          await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
          return outcome;
        }}
      />
    </AppShell>
  );
}

function StockBadge({ product }: { product: ProductRow }) {
  const stock = Number(product.stock);
  const min = Number(product.min_stock);
  const className =
    stock <= 0
      ? "bg-danger-soft text-destructive"
      : stock <= min
        ? "bg-warning-soft text-warning-foreground"
        : "bg-success-soft text-success";
  return (
    <span
      className={`inline-flex shrink-0 rounded-lg px-2.5 py-1 text-[13px] font-semibold tabular-nums ${className}`}
    >
      {stock <= 0 ? "Out of stock" : `${formatNumber(stock)} ${product.unit}`}
    </span>
  );
}
