import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Download,
  Loader2,
  MessageCircle,
  Minus,
  Package,
  Plus,
  Search,
  Upload,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { DeferredImage } from "@/components/deferred-image";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "@/hooks/use-debounce";
import { hasPermission, useWorkspace } from "@/hooks/use-workspace";
import {
  addCategory,
  addProduct,
  getCategories,
  getLocationStock,
  getLocations,
  getProducts,
  getSuppliers,
  importProductsFn,
  setPexelsProductImageFn,
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
import { getOnlineProductReadiness } from "@/lib/storefront/product-readiness";
import { getStorefrontAdminFn, saveListingFn } from "@/lib/storefront/storefront.functions";
import type { AdminStore } from "@/lib/storefront/contract";
import type { ImportColumn } from "@/lib/spreadsheet";
import { storePublicUrl } from "@/lib/storefront/host";
import {
  INVENTORY_IMPORT_BEFORE_YOU_IMPORT,
  INVENTORY_IMPORT_COLUMN_GUIDE,
  INVENTORY_IMPORT_NO_UNDO,
} from "@/lib/inventory-import-guide";
import { downloadXlsx } from "@/lib/xlsx-export";
import { buildProductWhatsAppMessage, buildWhatsAppShareUrl } from "@/lib/whatsapp";

// Aliases are matched after lowercasing and stripping spaces/underscores/
// hyphens (see normalizeHeader in lib/spreadsheet.ts), so "Retail Price",
// "retail_price" and "RetailPrice" all normalize to the same "retailprice"
// candidate, only one form needs listing here. Terms below lean on common
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
    key: "wholesalePrice",
    label: "Wholesale Price",
    required: false,
    aliases: ["wholesaleselling", "tradersprice", "caseprice"],
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

function InventoryError({ error, reset }: { error: unknown; reset: () => void }) {
  const normalized = error instanceof Error ? error : new Error("Unknown inventory error");
  return (
    <div className="mx-auto max-w-lg space-y-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">We couldn&apos;t open inventory</h1>
      <p className="text-sm text-muted-foreground">
        {readableError(
          normalized,
          "Nothing was deleted. This is a load error. Try again, do not create a second store.",
        )}
      </p>
      {normalized.message ? (
        <p className="break-words font-mono text-[11px] text-muted-foreground">
          {normalized.message}
        </p>
      ) : null}
      <Button className="rounded-full" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}

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
  errorComponent: InventoryError,
});

type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  cost_price: number;
  selling_price: number;
  wholesale_price: number | null;
  stock: number;
  min_stock: number;
  image_url: string | null;
  category_id: string | null;
};

type OnlineProduct = AdminStore["products"][number];

function onlineReadiness(product: OnlineProduct | undefined) {
  if (!product) return null;
  try {
    return getOnlineProductReadiness(product);
  } catch {
    return { ready: false, missing: ["Online details could not be checked"] };
  }
}

function Inventory() {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  const businessId = workspace.data?.business.id;
  const currency = workspace.data?.business.currency ?? "USD";
  const canManageProducts = hasPermission(workspace.data, "inventory.import");
  const canAdjustStock = hasPermission(workspace.data, "inventory.adjust");
  const canShowStockActions = canManageProducts || canAdjustStock;

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [stockTarget, setStockTarget] = useState<{
    product: ProductRow;
    mode: "in" | "out";
  } | null>(null);
  const [stockQty, setStockQty] = useState("");
  const [stockReason, setStockReason] = useState("");
  const [productLimit, setProductLimit] = useState(100);

  const fetchProducts = useServerFn(getProducts);
  const fetchLocations = useServerFn(getLocations);
  const fetchSuppliers = useServerFn(getSuppliers);
  const createProduct = useServerFn(addProduct);
  const uploadPhoto = useServerFn(uploadProductImageFn);
  const setPexelsProductImage = useServerFn(setPexelsProductImageFn);
  const adjustStock = useServerFn(updateStock);
  const importProductsRows = useServerFn(importProductsFn);
  const fetchCategories = useServerFn(getCategories);
  const createCategoryFn = useServerFn(addCategory);
  const fetchLocationStock = useServerFn(getLocationStock);
  const fetchStorefront = useServerFn(getStorefrontAdminFn);
  const saveOnlineListing = useServerFn(saveListingFn);
  const canManageOnline = workspace.data?.permissions.includes("business.settings") ?? false;

  useEffect(() => {
    if (!workspace.isLoading && workspace.data === null) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [workspace.isLoading, workspace.data, navigate]);

  const products = useQuery({
    queryKey: ["products", businessId, debouncedSearch, productLimit],
    enabled: Boolean(businessId),
    queryFn: () =>
      fetchProducts({
        data: { businessId: businessId!, search: debouncedSearch, limit: productLimit },
      }),
  });
  const storefront = useQuery({
    queryKey: ["storefront", businessId],
    enabled: Boolean(businessId),
    queryFn: () => fetchStorefront({ data: { businessId: businessId! } }),
  });
  const categories = useQuery({
    queryKey: ["categories", businessId],
    enabled: Boolean(businessId),
    queryFn: () => fetchCategories({ data: { businessId: businessId! } }),
  });
  const onlineListingMutation = useMutation({
    mutationFn: (input: { product: OnlineProduct; published: boolean }) =>
      saveOnlineListing({
        data: {
          businessId: businessId!,
          productId: input.product.id,
          published: input.published,
          publicName: input.product.publicName,
          details: input.product.details,
          sizeGuide: input.product.sizeGuide,
          minQty: input.product.minQty,
          maxQty: input.product.maxQty,
          featured: input.product.featured,
        },
      }),
    onSuccess: async () => {
      toast.success("Online availability updated.");
      await queryClient.invalidateQueries({ queryKey: ["storefront", businessId] });
    },
    onError: (error: Error) =>
      toast.error(readableError(error, "Could not update online availability.")),
  });

  const locations = useQuery({
    queryKey: ["locations", businessId],
    enabled: Boolean(businessId),
    queryFn: () => fetchLocations({ data: { businessId: businessId! } }),
  });

  const locationStock = useQuery({
    queryKey: ["locationStock", businessId, locationFilter],
    enabled: Boolean(businessId) && Boolean(locationFilter),
    queryFn: () =>
      fetchLocationStock({ data: { businessId: businessId!, locationId: locationFilter } }),
  });

  const suppliers = useQuery({
    queryKey: ["suppliers", businessId],
    enabled: Boolean(businessId) && addOpen,
    queryFn: () => fetchSuppliers({ data: { businessId: businessId!, search: "" } }),
  });

  const addCategoryMutation = useMutation({
    mutationFn: async (name: string) => {
      return createCategoryFn({ data: { businessId: businessId!, name } });
    },
    onSuccess: () => {
      setNewCategoryName("");
      toast.success("Category added.");
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (error: Error) => toast.error(readableError(error, "Couldn't add category.")),
  });

  const addMutation = useMutation({
    mutationFn: async (input: {
      fields: Record<string, unknown>;
      photo: File | null;
      imageUrl: string | null;
    }) => {
      const photo = input.photo ? await optimizeProductImage(input.photo) : null;
      const parsed = productSchema.parse({
        ...input.fields,
        businessId,
      });
      const created = await createProduct({ data: parsed });
      const productId = Array.isArray(created) ? created[0]?.id : created?.id;
      let imageError: string | null = null;
      if (photo || input.imageUrl) {
        if (!productId) {
          imageError = "The product was saved, but its photo could not be attached.";
        } else {
          try {
            if (photo) {
              const form = new FormData();
              form.set("businessId", businessId!);
              form.set("productId", productId);
              form.set("file", photo);
              await uploadPhoto({ data: form });
            } else if (input.imageUrl) {
              await setPexelsProductImage({
                data: { businessId: businessId!, productId, imageUrl: input.imageUrl },
              });
            }
          } catch (error) {
            const imageFailure =
              error instanceof Error
                ? error
                : new Error("The product was saved, but its photo could not be attached.");
            imageError = readableError(
              imageFailure,
              "The product was saved, but its photo could not be attached.",
            );
          }
        }
      }
      return { created, imageError };
    },
    onSuccess: async ({ imageError }) => {
      setAddOpen(false);
      if (imageError) {
        toast.error(imageError);
      } else {
        toast.success("Product added.");
      }
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["storefront", businessId] });
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
      await queryClient.invalidateQueries({ queryKey: ["storefront", businessId] });
    },
    onError: (error: Error) => toast.error(readableError(error, "We couldn't update the stock.")),
  });

  const allRows = (Array.isArray(products.data) ? products.data : []) as ProductRow[];
  const stockMap = useMemo(() => {
    if (!locationFilter || !locationStock.data) return null;
    const map = new Map<string, number>();
    for (const row of locationStock.data) map.set(row.product_id, row.quantity);
    return map;
  }, [locationFilter, locationStock.data]);
  const filteredRows = categoryFilter
    ? allRows.filter((p) => p.category_id === categoryFilter)
    : allRows;
  const rows = stockMap
    ? filteredRows.map((p) => ({ ...p, stock: stockMap.get(p.id) ?? 0 }))
    : filteredRows;
  const categoryList = categories.data ?? [];
  const columns = useMemo<ColumnDef<ProductRow, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Product",
        cell: ({ row }) => (
          <div className="flex max-w-[280px] items-center gap-3">
            {row.original.image_url ? (
              <DeferredImage
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
        accessorKey: "wholesale_price",
        header: "Wholesale",
        cell: ({ row }) =>
          row.original.wholesale_price == null ? (
            <span className="text-muted-foreground">-</span>
          ) : (
            <span className="tabular-nums text-muted-foreground">
              {formatMoney(Number(row.original.wholesale_price), currency)}
            </span>
          ),
      },
      {
        accessorKey: "stock",
        header: "Stock",
        cell: ({ row }) => <StockBadge product={row.original} />,
      },
      {
        id: "online",
        header: "Online store",
        enableSorting: false,
        cell: ({ row }) => {
          const onlineProduct = Array.isArray(storefront.data?.products)
            ? storefront.data.products.find((product) => product.id === row.original.id)
            : undefined;
          const readiness = onlineReadiness(onlineProduct);
          const pending =
            onlineListingMutation.isPending &&
            onlineListingMutation.variables?.product.id === row.original.id;
          return (
            <div className="space-y-1">
              <p className="text-xs font-medium">
                {onlineProduct?.published ? "Available online" : "Not listed online"}
              </p>
              {canManageOnline ? (
                <Button
                  size="sm"
                  variant={onlineProduct?.published ? "secondary" : "outline"}
                  disabled={
                    storefront.isLoading ||
                    !onlineProduct ||
                    pending ||
                    (!onlineProduct.published && !readiness?.ready)
                  }
                  onClick={() => {
                    if (onlineProduct) {
                      onlineListingMutation.mutate({
                        product: onlineProduct,
                        published: !onlineProduct.published,
                      });
                    }
                  }}
                >
                  {pending
                    ? "Saving…"
                    : onlineProduct?.published
                      ? "Disable online"
                      : "Make available"}
                </Button>
              ) : null}
              {!onlineProduct?.published && readiness && !readiness.ready ? (
                <p className="max-w-40 text-xs text-warning-foreground">{readiness.missing[0]}</p>
              ) : null}
              <a
                href="/storefront#launch-products"
                className="block text-xs font-medium text-foreground underline"
              >
                Manage online details
              </a>
            </div>
          );
        },
      },
      ...(canShowStockActions
        ? [
            {
              id: "actions",
              header: () => <span className="block text-right">Actions</span>,
              enableSorting: false,
              cell: ({ row }) => {
                const product = row.original;
                const listing = Array.isArray(storefront.data?.products)
                  ? storefront.data.products.find((item) => item.id === product.id)
                  : undefined;
                const slug = storefront.data?.store?.slug;
                const listingSlug = listing?.slug;
                const stock = Number(product.stock);
                const href = buildWhatsAppShareUrl(
                  buildProductWhatsAppMessage({
                    businessName: workspace.data?.business.name ?? "",
                    productName: product.name,
                    price: Number(product.selling_price),
                    currency,
                    availability:
                      stock <= 0
                        ? "Out of stock"
                        : `${formatNumber(stock)} ${product.unit} available`,
                    url:
                      slug && listingSlug && listing?.published
                        ? storePublicUrl(slug, `/products/${listingSlug}`)
                        : null,
                  }),
                );
                return (
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" className="gap-1" asChild>
                      <a href={href} target="_blank" rel="noreferrer">
                        <MessageCircle className="size-3.5" aria-hidden="true" /> Share
                      </a>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() => setStockTarget({ product, mode: "in" })}
                    >
                      <Plus className="size-3.5" aria-hidden="true" /> In
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() => setStockTarget({ product, mode: "out" })}
                    >
                      <Minus className="size-3.5" aria-hidden="true" /> Out
                    </Button>
                  </div>
                );
              },
            } satisfies ColumnDef<ProductRow, unknown>,
          ]
        : []),
    ],
    [
      canShowStockActions,
      canManageOnline,
      currency,
      onlineListingMutation,
      storefront.data,
      storefront.isLoading,
      workspace.data?.business.name,
    ],
  );

  if (workspace.isError) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6 text-center">
        <h1 className="text-2xl font-semibold">We couldn&apos;t open inventory</h1>
        <p className="text-sm text-muted-foreground">
          Nothing was deleted. This is a load error. Try again, do not create a second store.
        </p>
        <Button className="rounded-full" onClick={() => void workspace.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

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
        headers: ["Name", "SKU", "Unit", "Cost", "Price", "Wholesale", "Stock", "Min stock"],
        rows: rows.map((p) => [
          p.name,
          p.sku ?? "",
          p.unit,
          p.cost_price,
          p.selling_price,
          p.wholesale_price ?? "",
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
      subtitleAsTooltip
      actions={
        <>
          {rows.length > 0 ? (
            <Button variant="outline" className="gap-1.5" onClick={exportExcel}>
              <Download className="size-4" aria-hidden="true" /> Export to Excel
            </Button>
          ) : null}
          {canManageProducts ? (
            <>
              <Button variant="outline" className="gap-1.5" onClick={() => setCategoriesOpen(true)}>
                Categories
              </Button>
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
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm grow">
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
        {categoryList.length > 0 ? (
          <Select
            value={categoryFilter || "all"}
            onValueChange={(v) => setCategoryFilter(v === "all" ? "" : v)}
          >
            <SelectTrigger className="w-44" aria-label="Filter by category">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categoryList
                .filter((cat) => cat.id)
                .map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        ) : null}
        {locations.data && locations.data.length > 1 ? (
          <Select
            value={locationFilter || "all"}
            onValueChange={(v) => setLocationFilter(v === "all" ? "" : v)}
          >
            <SelectTrigger className="w-48" aria-label="Filter by location">
              <SelectValue placeholder="All locations (total)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All locations (total)</SelectItem>
              {locations.data
                .filter((loc) => loc.id)
                .map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name}
                    {loc.is_default ? " (default)" : ""}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>
      {locations.data && locations.data.length > 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {locationFilter ? (
            `Showing stock for: ${locations.data.find((l) => l.id === locationFilter)?.name ?? "selected location"}.`
          ) : (
            <>
              Default location:{" "}
              {locations.data.find((l) => l.is_default)?.name ?? locations.data[0]?.name}
              {locations.data.length > 1
                ? `. ${locations.data.length} active locations. Stock numbers here are the total.`
                : ". Stock numbers here match this location."}
            </>
          )}
        </p>
      ) : null}
      {storefront.isLoading ? (
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          Loading online availability…
        </p>
      ) : null}
      {products.isError ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 p-3">
          <p className="text-sm text-destructive">
            {readableError(products.error as Error, "Products could not be loaded.")}
          </p>
          <Button size="sm" variant="outline" onClick={() => void products.refetch()}>
            Retry products
          </Button>
        </div>
      ) : null}
      {storefront.isError ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 p-3">
          <p className="text-sm text-destructive">
            {readableError(storefront.error as Error, "Online availability could not be loaded.")}
          </p>
          <Button size="sm" variant="outline" onClick={() => void storefront.refetch()}>
            Retry online status
          </Button>
        </div>
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
            {search ? (
              <Button className="mt-5" variant="outline" onClick={() => setSearch("")}>
                Clear search
              </Button>
            ) : canManageProducts ? (
              <Button className="mt-5 gap-1.5" onClick={() => setAddOpen(true)}>
                <Plus className="size-4" aria-hidden="true" /> Add your first product
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <ul className="divide-y divide-border lg:hidden">
              {rows.map((product) => {
                const onlineProduct = Array.isArray(storefront.data?.products)
                  ? storefront.data.products.find((item) => item.id === product.id)
                  : undefined;
                const readiness = onlineReadiness(onlineProduct);
                const pending =
                  onlineListingMutation.isPending &&
                  onlineListingMutation.variables?.product.id === product.id;
                return (
                  <li key={product.id} className="p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 p-2">
                      <span className="text-xs font-medium">
                        {onlineProduct?.published ? "Available online" : "Not listed online"}
                      </span>
                      {canManageOnline ? (
                        <Button
                          size="sm"
                          variant={onlineProduct?.published ? "secondary" : "outline"}
                          disabled={
                            storefront.isLoading ||
                            !onlineProduct ||
                            pending ||
                            (!onlineProduct.published && !readiness?.ready)
                          }
                          onClick={() => {
                            if (onlineProduct) {
                              onlineListingMutation.mutate({
                                product: onlineProduct,
                                published: !onlineProduct.published,
                              });
                            }
                          }}
                        >
                          {pending
                            ? "Saving…"
                            : onlineProduct?.published
                              ? "Disable online"
                              : "Make available"}
                        </Button>
                      ) : null}
                      {!onlineProduct?.published && readiness && !readiness.ready ? (
                        <span className="w-full text-xs text-warning-foreground">
                          {readiness.missing[0]}
                        </span>
                      ) : null}
                      <a
                        href="/storefront#launch-products"
                        className="text-xs font-medium underline"
                      >
                        Manage online details
                      </a>
                    </div>
                    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
                      {product.image_url ? (
                        <DeferredImage
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
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" className="gap-1" asChild>
                        <a
                          href={buildWhatsAppShareUrl(
                            buildProductWhatsAppMessage({
                              businessName: workspace.data?.business.name ?? "",
                              productName: product.name,
                              price: Number(product.selling_price),
                              currency,
                              availability:
                                Number(product.stock) <= 0
                                  ? "Out of stock"
                                  : `${formatNumber(Number(product.stock))} ${product.unit} available`,
                              url:
                                storefront.data?.store?.slug &&
                                onlineProduct?.slug &&
                                onlineProduct.published
                                  ? storePublicUrl(
                                      storefront.data.store.slug,
                                      `/products/${onlineProduct.slug}`,
                                    )
                                  : null,
                            }),
                          )}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <MessageCircle className="size-3.5" aria-hidden="true" /> Share
                        </a>
                      </Button>
                      {canShowStockActions ? (
                        <>
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
                        </>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="hidden lg:block">
              <DataTable columns={columns} data={rows} caption="Inventory products" />
            </div>
            {!search && rows.length >= productLimit && productLimit < 500 ? (
              <div className="flex justify-center border-t border-border p-4">
                <Button variant="outline" onClick={() => setProductLimit((n) => n + 100)}>
                  Show more products
                </Button>
              </div>
            ) : null}
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
            categories={categoryList}
            pending={addMutation.isPending}
            onCancel={() => setAddOpen(false)}
            onSubmit={(values, photo, imageUrl) =>
              addMutation.mutate({
                fields: values as Record<string, unknown>,
                photo,
                imageUrl,
              })
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
        description={`Upload Excel or CSV with a header row. ${INVENTORY_IMPORT_COLUMN_GUIDE.map((c) => `${c.label}: ${c.headers}`).join(". ")}. ${INVENTORY_IMPORT_BEFORE_YOU_IMPORT[1]} ${INVENTORY_IMPORT_NO_UNDO}`}
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
          await queryClient.invalidateQueries({ queryKey: ["storefront", businessId] });
          return outcome;
        }}
      />

      <Dialog open={categoriesOpen} onOpenChange={setCategoriesOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Product categories</DialogTitle>
            <DialogDescription>
              Organise products into categories. Categories are shared across your catalogue.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-60 space-y-1 overflow-y-auto">
            {categoryList.length === 0 ? (
              <li className="py-4 text-center text-sm text-muted-foreground">No categories yet</li>
            ) : (
              categoryList.map((cat) => (
                <li key={cat.id} className="rounded-md px-3 py-2 text-sm odd:bg-muted/40">
                  {cat.name}
                </li>
              ))
            )}
          </ul>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (newCategoryName.trim()) {
                addCategoryMutation.mutate(newCategoryName.trim());
              }
            }}
          >
            <Input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="New category name"
              maxLength={80}
              className="grow"
            />
            <Button
              type="submit"
              disabled={addCategoryMutation.isPending || !newCategoryName.trim()}
              className="gap-1.5"
            >
              {addCategoryMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              Add
            </Button>
          </form>
        </DialogContent>
      </Dialog>
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
