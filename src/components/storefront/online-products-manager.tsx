import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney, formatNumber, readableError } from "@/lib/format";
import { optimizeProductImage } from "@/lib/product-image-optimizer";
import { getOnlineProductReadiness } from "@/lib/storefront/product-readiness";
import {
  removeStorefrontProductImageFn,
  saveListingFn,
  setProductCategoryFn,
  uploadStorefrontProductImageFn,
} from "@/lib/storefront/storefront.functions";
import type { AdminStore } from "@/lib/storefront/contract";

type OnlineProduct = AdminStore["products"][number];
type ListingInput = {
  product: OnlineProduct;
  publicName: string;
  details: string;
  published: boolean;
};

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_CLIENT_IMAGE_BYTES = 12 * 1024 * 1024;

export function OnlineProductsManager({
  businessId,
  currency,
  categories,
  products,
  canManage,
}: {
  businessId: string;
  currency: string;
  categories: AdminStore["categories"];
  products: OnlineProduct[];
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const saveListing = useServerFn(saveListingFn);
  const setProductCategory = useServerFn(setProductCategoryFn);
  const uploadImage = useServerFn(uploadStorefrontProductImageFn);
  const removeImage = useServerFn(removeStorefrontProductImageFn);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return products.filter((product) => {
      const matchesSearch =
        !term ||
        [product.name, product.publicName ?? "", product.sku ?? "", product.categoryName ?? ""]
          .join(" ")
          .toLocaleLowerCase()
          .includes(term);
      const matchesCategory =
        category === "all" ||
        (category === "uncategorized" ? !product.categoryId : product.categoryId === category);
      return matchesSearch && matchesCategory;
    });
  }, [category, products, search]);

  const invalidateStorefront = () =>
    queryClient.invalidateQueries({ queryKey: ["storefront", businessId] });

  const saveMutation = useMutation({
    mutationFn: (input: ListingInput) =>
      saveListing({
        data: {
          businessId,
          productId: input.product.id,
          published: input.published,
          publicName: input.publicName.trim() || null,
          details: input.details.trim(),
          sizeGuide: input.product.sizeGuide,
          minQty: input.product.minQty,
          maxQty: input.product.maxQty,
          featured: input.product.featured,
        },
      }),
    onSuccess: async () => {
      toast.success("Online product details saved.");
      await invalidateStorefront();
    },
    onError: (error: Error) =>
      toast.error(readableError(error, "Could not save the online product details.")),
  });

  const categoryMutation = useMutation({
    mutationFn: (input: { productId: string; categoryId: string | null }) =>
      setProductCategory({ data: { businessId, ...input } }),
    onSuccess: async () => {
      toast.success("Inventory category updated.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["storefront", businessId] }),
        queryClient.invalidateQueries({ queryKey: ["products"] }),
      ]);
    },
    onError: (error: Error) =>
      toast.error(readableError(error, "Could not update the inventory category.")),
  });

  const uploadMutation = useMutation({
    mutationFn: async (input: ListingInput & { file: File; replaceImageUrl?: string }) => {
      const optimized = await optimizeProductImage(input.file);
      await saveListing({
        data: {
          businessId,
          productId: input.product.id,
          published: input.published,
          publicName: input.publicName.trim() || null,
          details: input.details.trim(),
          sizeGuide: input.product.sizeGuide,
          minQty: input.product.minQty,
          maxQty: input.product.maxQty,
          featured: input.product.featured,
        },
      });
      const formData = new FormData();
      formData.set("businessId", businessId);
      formData.set("productId", input.product.id);
      formData.set("file", optimized);
      await uploadImage({ data: formData });
      if (input.replaceImageUrl) {
        await removeImage({
          data: {
            businessId,
            productId: input.product.id,
            imageUrl: input.replaceImageUrl,
          },
        });
      }
    },
    onSuccess: async () => {
      toast.success("Product image saved.");
      await invalidateStorefront();
    },
    onError: (error: Error) => {
      toast.error(readableError(error, "Could not save the product image. Please try again."));
      void invalidateStorefront();
    },
  });

  const removeMutation = useMutation({
    mutationFn: (input: { productId: string; imageUrl: string }) =>
      removeImage({ data: { businessId, ...input } }),
    onSuccess: async () => {
      toast.success("Product image removed.");
      await invalidateStorefront();
    },
    onError: (error: Error) =>
      toast.error(readableError(error, "Could not remove the product image.")),
  });

  function chooseImage(input: ListingInput, file: File | undefined, replaceImageUrl?: string) {
    if (!file) return;
    if (
      !ACCEPTED_IMAGE_TYPES.includes(file.type) ||
      file.size <= 0 ||
      file.size > MAX_CLIENT_IMAGE_BYTES
    ) {
      toast.error("Choose a JPEG, PNG, or WebP image up to 12 MB.");
      return;
    }
    uploadMutation.mutate({ ...input, file, ...(replaceImageUrl ? { replaceImageUrl } : {}) });
  }

  return (
    <section className="space-y-4" aria-labelledby="launch-products">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 id="launch-products" className="text-base font-semibold">
            Online products
          </h2>
          <p className="text-sm text-muted-foreground">
            These are existing Inventory items. Online prices use the inventory selling price in{" "}
            {currency}; editing online details does not change inventory notes or prices.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/inventory">Back to Inventory</Link>
        </Button>
      </div>

      {products.length === 0 ? (
        <div className="surface space-y-2 p-5">
          <h3 className="font-medium">No active inventory products yet</h3>
          <p className="text-sm text-muted-foreground">
            Add an item in Inventory first. It stays internal until you choose to make it available
            online.
          </p>
          <Button asChild size="sm">
            <Link to="/inventory">Add or manage inventory</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search products, SKU, or category"
              aria-label="Search online products"
            />
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm sm:w-56"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              aria-label="Filter online products by category"
            >
              <option value="all">All categories</option>
              <option value="uncategorized">Uncategorized</option>
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          {filteredProducts.length === 0 ? (
            <p className="surface p-5 text-sm text-muted-foreground">
              No inventory items match these filters.
            </p>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {filteredProducts.map((product) => (
                <OnlineProductCard
                  key={product.id}
                  product={product}
                  currency={currency}
                  categories={categories}
                  canManage={canManage}
                  saving={
                    saveMutation.isPending && saveMutation.variables?.product.id === product.id
                  }
                  uploading={
                    uploadMutation.isPending && uploadMutation.variables?.product.id === product.id
                  }
                  removing={
                    removeMutation.isPending && removeMutation.variables?.productId === product.id
                  }
                  updatingCategory={
                    categoryMutation.isPending &&
                    categoryMutation.variables?.productId === product.id
                  }
                  onSave={(input) => saveMutation.mutate(input)}
                  onToggle={(input) => saveMutation.mutate(input)}
                  onCategoryChange={(categoryId) =>
                    categoryMutation.mutate({ productId: product.id, categoryId })
                  }
                  onChooseImage={chooseImage}
                  onRemoveImage={(imageUrl) =>
                    removeMutation.mutate({ productId: product.id, imageUrl })
                  }
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function OnlineProductCard({
  product,
  currency,
  categories,
  canManage,
  saving,
  uploading,
  removing,
  updatingCategory,
  onSave,
  onToggle,
  onCategoryChange,
  onChooseImage,
  onRemoveImage,
}: {
  product: OnlineProduct;
  currency: string;
  categories: AdminStore["categories"];
  canManage: boolean;
  saving: boolean;
  uploading: boolean;
  removing: boolean;
  updatingCategory: boolean;
  onSave: (input: ListingInput) => void;
  onToggle: (input: ListingInput) => void;
  onCategoryChange: (categoryId: string | null) => void;
  onChooseImage: (input: ListingInput, file: File | undefined, replaceImageUrl?: string) => void;
  onRemoveImage: (imageUrl: string) => void;
}) {
  const [publicName, setPublicName] = useState(product.publicName ?? "");
  const [details, setDetails] = useState(product.details);
  const listingInput = (published = product.published): ListingInput => ({
    product,
    publicName,
    details,
    published,
  });
  const readiness = getOnlineProductReadiness(product);
  const customerName = publicName.trim() || product.name;
  const previewImage = product.imageUrl ?? product.galleryUrls[0] ?? null;

  return (
    <article className="surface space-y-4 p-4">
      <div className="flex gap-3">
        {previewImage ? (
          <img
            src={previewImage}
            alt=""
            className="size-20 shrink-0 rounded-md border object-cover"
          />
        ) : (
          <div className="grid size-20 shrink-0 place-items-center rounded-md border bg-muted text-center text-xs text-muted-foreground">
            Missing product image
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate font-medium">{customerName}</p>
          {customerName !== product.name ? (
            <p className="truncate text-xs text-muted-foreground">Inventory: {product.name}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {product.categoryName ?? "Uncategorized"}
            {product.sku ? ` · ${product.sku}` : ""}
          </p>
          <p className="font-semibold">{formatMoney(product.price, currency)}</p>
          <p className={product.stock > 0 ? "text-xs text-success" : "text-xs text-destructive"}>
            {product.stock > 0
              ? `${formatNumber(product.stock)} ${product.unit} in stock`
              : "Out of stock"}
          </p>
        </div>
        <span
          className={
            product.published
              ? "h-fit rounded-full bg-success-soft px-2.5 py-1 text-xs font-medium text-success"
              : "h-fit rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
          }
        >
          {product.published ? "Available online" : "Not listed online"}
        </span>
      </div>

      <div className="grid gap-3">
        <label className="space-y-1.5 text-sm">
          <Label htmlFor={`category-${product.id}`}>Inventory category</Label>
          <select
            id={`category-${product.id}`}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={product.categoryId ?? ""}
            disabled={!canManage || updatingCategory}
            onChange={(event) => onCategoryChange(event.target.value || null)}
          >
            <option value="">Uncategorized</option>
            {categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5 text-sm">
          <Label htmlFor={`public-name-${product.id}`}>Customer-facing name (optional)</Label>
          <Input
            id={`public-name-${product.id}`}
            value={publicName}
            maxLength={160}
            disabled={!canManage}
            onChange={(event) => setPublicName(event.target.value)}
            placeholder={product.name}
          />
        </label>
        <label className="space-y-1.5 text-sm">
          <Label htmlFor={`public-details-${product.id}`}>Online product description</Label>
          <Textarea
            id={`public-details-${product.id}`}
            value={details}
            maxLength={2000}
            rows={3}
            disabled={!canManage}
            onChange={(event) => setDetails(event.target.value)}
            placeholder="Describe this item for customers"
          />
        </label>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Customer-facing photos</p>
        {product.imageUrl ? (
          <p className="text-xs text-muted-foreground">
            The primary photo is shared with Inventory. Additional photos below are storefront-only.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {product.galleryUrls.map((imageUrl, index) => (
            <div key={imageUrl} className="relative">
              <img
                src={imageUrl}
                alt={`${customerName} photo ${index + 1}`}
                className="size-14 rounded border object-cover"
              />
              {canManage ? (
                <>
                  <label className="absolute inset-0 grid cursor-pointer place-items-center rounded bg-black/50 text-[10px] font-medium text-white opacity-0 transition-opacity hover:opacity-100 focus-within:opacity-100">
                    Replace
                    <input
                      className="sr-only"
                      type="file"
                      accept={ACCEPTED_IMAGE_TYPES.join(",")}
                      aria-label={`Replace ${customerName} photo ${index + 1}`}
                      disabled={uploading}
                      onChange={(event) => {
                        onChooseImage(listingInput(), event.currentTarget.files?.[0], imageUrl);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="absolute -right-1 -top-1 rounded-full bg-background px-1.5 text-sm shadow"
                    aria-label={`Remove ${customerName} photo ${index + 1}`}
                    disabled={removing}
                    onClick={() => onRemoveImage(imageUrl)}
                  >
                    ×
                  </button>
                </>
              ) : null}
            </div>
          ))}
          {canManage && product.galleryUrls.length < 8 ? (
            <label className="cursor-pointer rounded-md border px-3 py-2 text-sm hover:bg-muted">
              {uploading ? "Uploading…" : "Add photo"}
              <input
                className="sr-only"
                type="file"
                accept={ACCEPTED_IMAGE_TYPES.join(",")}
                aria-label={`Add a customer-facing photo for ${customerName}`}
                disabled={uploading}
                onChange={(event) => {
                  onChooseImage(listingInput(), event.currentTarget.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          ) : null}
        </div>
        {uploading ? (
          <p className="text-xs text-muted-foreground">Uploading and saving photo…</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">
          {readiness.ready ? "Ready to list" : "Needs attention"}
        </p>
        {readiness.missing.length > 0 ? (
          <ul className="flex flex-wrap gap-2 text-xs text-warning-foreground">
            {readiness.missing.map((item) => (
              <li key={item} className="rounded-full bg-warning-soft px-2.5 py-1">
                {item}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <details className="rounded-md border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Preview customer information
        </summary>
        <div className="mt-3 space-y-2">
          {previewImage ? (
            <img src={previewImage} alt="" className="max-h-44 rounded-md object-cover" />
          ) : null}
          <p className="font-semibold">{customerName}</p>
          <p className="text-sm font-medium">{formatMoney(product.price, currency)}</p>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {details || "Add a product description to show customers more about this item."}
          </p>
        </div>
      </details>

      {canManage ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={saving}
            onClick={() => onSave(listingInput())}
          >
            {saving ? "Saving…" : "Save online details"}
          </Button>
          <Button
            size="sm"
            disabled={saving || (!product.published && !readiness.ready)}
            variant={product.published ? "secondary" : "default"}
            onClick={() => onToggle(listingInput(!product.published))}
          >
            {saving
              ? "Saving…"
              : product.published
                ? "Disable online listing"
                : "Make available online"}
          </Button>
        </div>
      ) : null}
      {!canManage ? (
        <p className="text-xs text-muted-foreground">
          You have view-only access to online products.
        </p>
      ) : null}
      {!product.published && !readiness.ready ? (
        <p className="text-xs text-muted-foreground">
          Add the missing price, image, and description before making this item available online.
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Inventory selling price and stock remain the source of truth.{" "}
        <Link to="/inventory" className="font-medium underline">
          Manage inventory
        </Link>
      </p>
    </article>
  );
}
