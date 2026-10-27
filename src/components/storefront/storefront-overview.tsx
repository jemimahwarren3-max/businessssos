import { Link } from "@tanstack/react-router";
import { AlertCircle, ExternalLink, Loader2, Package, RefreshCw, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AdminStore } from "@/lib/storefront/contract";
import { deriveStoreLaunchDisplay } from "@/lib/storefront/launch-status";

export function StorefrontOverview({
  admin,
  businessName,
  publicUrl,
  billingEnabled,
  isOperateLocked,
  isReadOnly,
  canManageSettings,
  onCreateStore,
  creatingStore,
  onScrollToSetup,
}: {
  admin: AdminStore;
  businessName: string;
  publicUrl: string;
  billingEnabled: boolean;
  isOperateLocked: boolean;
  isReadOnly: boolean;
  canManageSettings: boolean;
  onCreateStore: () => void;
  creatingStore: boolean;
  onScrollToSetup: () => void;
}) {
  const store = admin.store;
  const display = deriveStoreLaunchDisplay({
    checklist: admin.checklist,
    storeStatus: store?.status,
    billingEnabled,
    isOperateLocked,
  });

  const productTotal = admin.products.length;
  const publishedCount = admin.metrics.publishedProducts;
  const inventoryWithStock = admin.products.filter((p) => p.stock > 0).length;

  return (
    <section className="surface space-y-4 p-5" aria-labelledby="storefront-overview-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 id="storefront-overview-heading" className="text-lg font-semibold tracking-tight">
            Store overview
          </h2>
          <p className="text-sm text-muted-foreground">
            Status and shortcuts for your online shop — separate from invoices and POS.
          </p>
        </div>
        <Badge variant="outline" className="capitalize">
          {display.badge}
        </Badge>
      </div>

      {!store ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
          <p className="flex items-start gap-2 text-sm">
            <Store className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              You have not created an online store record yet. Kwetuu will use your business name (
              <strong>{businessName}</strong>
              ), default design, and pickup-friendly settings. You can change everything before
              publishing.
            </span>
          </p>
          {canManageSettings && !isReadOnly ? (
            <Button
              type="button"
              className="mt-3"
              disabled={creatingStore}
              onClick={onCreateStore}
            >
              {creatingStore ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Creating…
                </>
              ) : (
                "Create my store"
              )}
            </Button>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Ask an owner or admin to create the store, or upgrade if your account is read-only.
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <OverviewCard title="Shop name" value={store.storeName || "—"} />
          <OverviewCard
            title="Publication"
            value={store.status === "published" ? "Published" : "Draft"}
            hint={
              store.status === "published" && store.publishedAt
                ? `Since ${new Date(store.publishedAt).toLocaleDateString()}`
                : display.headline
            }
          />
          <OverviewCard
            title="Public link"
            value={store.slug ? store.slug : "Set a shop link below"}
            hint={publicUrl ? publicUrl : "Save a link slug in setup to preview"}
          />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <OverviewCard title="Catalogue items" value={String(productTotal)} />
        <OverviewCard title="Published online" value={String(publishedCount)} />
        <OverviewCard title="In stock" value={String(inventoryWithStock)} />
        <OverviewCard
          title="Open orders"
          value={String(admin.metrics.openOrders)}
          hint={`${admin.metrics.unpaidOrders} awaiting payment`}
        />
      </div>

      {productTotal === 0 ? (
        <p className="rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          No products yet. Add items in{" "}
          <Link to="/inventory" className="font-medium text-primary underline">
            Inventory
          </Link>{" "}
          — the same products appear here when you publish them to the shop.
        </p>
      ) : publishedCount === 0 ? (
        <p className="rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          You have {productTotal} product{productTotal === 1 ? "" : "s"} in inventory but none are
          published on the storefront yet. Scroll to{" "}
          <button
            type="button"
            className="font-medium text-primary underline"
            onClick={() => document.getElementById("launch-products")?.scrollIntoView({ behavior: "smooth" })}
          >
            Products
          </button>{" "}
          below to turn listings on.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {publishedCount} product{publishedCount === 1 ? " is" : "s are"} visible on your shop
          {admin.metrics.outOfStockPublished > 0
            ? ` (${admin.metrics.outOfStockPublished} published but out of stock)`
            : ""}
          .
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {store && store.status === "published" && publicUrl ? (
          <Button asChild size="sm">
            <a href={publicUrl} target="_blank" rel="noreferrer">
              View live store
              <ExternalLink className="ml-1 size-3.5" aria-hidden />
            </a>
          </Button>
        ) : null}
        {store?.slug ? (
          <Button asChild size="sm" variant="outline">
            <Link to="/store/$slug" params={{ slug: store.slug }} search={{ preview: "1" }}>
              Preview store
            </Link>
          </Button>
        ) : store ? (
          <Button type="button" size="sm" variant="outline" onClick={onScrollToSetup}>
            Set shop link
          </Button>
        ) : null}
        <Button asChild size="sm" variant="outline">
          <Link to="/inventory">
            <Package className="mr-1 size-3.5" aria-hidden />
            Manage products
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/online-orders">Online orders</Link>
        </Button>
        {display.phase === "payment_required" ? (
          <Button asChild size="sm" variant="secondary">
            <Link to="/settings/billing">Upgrade to publish</Link>
          </Button>
        ) : null}
        {store && store.status !== "published" && canManageSettings && !isReadOnly ? (
          <Button type="button" size="sm" variant="ghost" onClick={onScrollToSetup}>
            Continue setup
          </Button>
        ) : null}
      </div>

      {store ? (
        <p className="text-[13px] text-muted-foreground">{display.headline}</p>
      ) : null}
    </section>
  );
}

function OverviewCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <p className="mt-0.5 text-base font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{hint}</p> : null}
    </div>
  );
}

export function StorefrontLoadError({
  message,
  onRetry,
  retrying,
}: {
  message: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <div
      className="surface flex flex-col items-start gap-3 border-destructive/30 p-5"
      role="alert"
    >
      <p className="flex items-center gap-2 text-sm font-medium text-destructive">
        <AlertCircle className="size-4 shrink-0" aria-hidden />
        {message}
      </p>
      <p className="text-sm text-muted-foreground">
        This usually means the shop data RPC failed, migrations are missing on this environment, or
        your session expired. Try again after signing in.
      </p>
      <Button type="button" variant="outline" size="sm" disabled={retrying} onClick={onRetry}>
        {retrying ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Retrying…
          </>
        ) : (
          <>
            <RefreshCw className="size-4" aria-hidden />
            Retry
          </>
        )}
      </Button>
    </div>
  );
}

export function StorefrontOverviewSkeleton() {
  return (
    <div className="surface space-y-3 p-5" aria-busy="true" aria-label="Loading store overview">
      <div className="h-6 w-48 animate-pulse rounded bg-muted" />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="h-20 animate-pulse rounded-lg bg-muted" />
        <div className="h-20 animate-pulse rounded-lg bg-muted" />
        <div className="h-20 animate-pulse rounded-lg bg-muted" />
      </div>
    </div>
  );
}
