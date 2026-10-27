import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { CustomerShoppingShell } from "@/components/storefront/customer-shopping-shell";
import { PublishedShopGrid } from "@/components/storefront/published-shop-card";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import type { Marketplace, MarketplaceProduct } from "@/lib/storefront/contract";
import { BRAND } from "@/lib/brand";
import { storePublicUrl } from "@/lib/storefront/host";
import { getMarketplaceFn } from "@/lib/storefront/storefront.functions";

const searchSchema = z.object({
  q: z.string().max(80).optional().catch(""),
  category: z.string().max(80).optional().catch(""),
  shop: z.string().max(40).optional().catch(""),
  page: z.coerce.number().int().min(1).optional().catch(1),
});

const PAGE_SIZE = 24;

export const Route = createFileRoute("/market")({
  validateSearch: (search: Record<string, unknown>) => searchSchema.parse(search),
  loaderDeps: ({ search }) => ({
    q: search.q ?? "",
    category: search.category ?? "",
    page: search.page ?? 1,
  }),
  loader: async ({ deps }): Promise<Marketplace> => {
    const page = deps.page ?? 1;
    const offset = (page - 1) * PAGE_SIZE;
    return getMarketplaceFn({
      data: { query: deps.q, category: deps.category, offset },
    });
  },
  head: ({ loaderData }) => {
    const category = loaderData?.category ? `${loaderData.category} · ` : "";
    const title = `${category}Shops on ${BRAND.name}`;
    return {
      meta: [
        { title },
        {
          name: "description",
          content: `Browse published shops and products from businesses using ${BRAND.name}. Each product is sold by the shop named on the card.`,
        },
        { property: "og:title", content: title },
        { property: "og:type", content: "website" },
      ],
    };
  },
  component: MarketPage,
  pendingComponent: MarketPending,
  errorComponent: MarketError,
});

function MarketPending() {
  return (
    <MarketFrame>
      <p className="mt-6 text-sm text-muted-foreground">Loading marketplace…</p>
    </MarketFrame>
  );
}

function MarketError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : "Something unexpected happened.";
  return (
    <MarketFrame>
      <p className="text-sm text-destructive">{message}</p>
      <Button asChild className="mt-4" variant="outline">
        <Link to="/market" search={{ q: "", category: "" }}>
          Try again
        </Link>
      </Button>
    </MarketFrame>
  );
}

function MarketPage() {
  const market = Route.useLoaderData();
  const search = Route.useSearch();
  const page = search.page ?? 1;
  const selectedShop = search.shop ?? "";
  const products = selectedShop
    ? market.products.filter((product) => product.storeSlug === selectedShop)
    : market.products;
  const filtering = Boolean(market.query || market.category || selectedShop);
  const emptyDirectory = market.shops.length === 0 && !filtering;

  return (
    <MarketFrame>
      <form className="mt-6 flex flex-col gap-2 sm:flex-row" method="get">
        <label className="sr-only" htmlFor="market-q">
          Search shops and products
        </label>
        <input
          id="market-q"
          name="q"
          defaultValue={search.q ?? ""}
          placeholder="Search shops or products"
          className="h-11 flex-1 rounded-md border border-input bg-background px-3 text-sm"
        />
        {market.category ? <input type="hidden" name="category" value={market.category} /> : null}
        {selectedShop ? <input type="hidden" name="shop" value={selectedShop} /> : null}
        <Button type="submit">Search</Button>
      </form>

      {market.shops.length > 0 ? (
        <form className="mt-3 flex flex-wrap items-end gap-2" method="get">
          <input type="hidden" name="q" value={search.q ?? ""} />
          <input type="hidden" name="category" value={market.category} />
          <label className="grid gap-1 text-sm">
            <span>Choose a preferred shop</span>
            <select
              name="shop"
              defaultValue={selectedShop}
              className="h-10 min-w-56 rounded-md border border-input bg-background px-3"
            >
              <option value="">All shops</option>
              {market.shops.map((shop) => (
                <option key={shop.slug} value={shop.slug}>
                  {shop.storeName}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="outline">
            Apply shop
          </Button>
          {selectedShop ? (
            <Link
              to="/market"
              search={{ q: search.q ?? "", category: market.category, shop: "" }}
              className="px-2 py-2 text-sm underline"
            >
              Clear shop
            </Link>
          ) : null}
        </form>
      ) : null}

      {market.categories.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            to="/market"
            search={{ q: search.q ?? "", category: "", shop: selectedShop }}
            className={`rounded-full border px-3 py-1 text-sm ${market.category ? "text-muted-foreground" : "border-foreground"}`}
          >
            All
          </Link>
          {market.categories.map((category) => (
            <Link
              key={category.name}
              to="/market"
              search={{ q: search.q ?? "", category: category.name, shop: selectedShop }}
              className={`rounded-full border px-3 py-1 text-sm ${
                market.category.toLowerCase() === category.name.toLowerCase()
                  ? "border-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {category.name} ({category.count})
            </Link>
          ))}
        </div>
      ) : null}

      {emptyDirectory ? (
        <div className="mt-10 rounded-lg border border-dashed p-8 text-center">
          <p className="font-medium">No published shops yet</p>
          <p className="mt-2 text-sm text-muted-foreground">
            When sellers publish and list their shops, products will appear here. Nothing is seeded
            with demo data.
          </p>
          <Button asChild className="mt-4" variant="outline">
            <Link to="/stores">Browse the shop directory</Link>
          </Button>
        </div>
      ) : null}

      {!filtering || market.shops.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Shops</h2>
          {market.shops.length === 0 && filtering ? (
            <p className="mt-3 text-sm text-muted-foreground">No shops matched that search.</p>
          ) : (
            <div className="mt-4">
              <PublishedShopGrid shops={market.shops} />
            </div>
          )}
        </section>
      ) : null}

      {!filtering && market.featured.length > 0 ? (
        <ProductSection title="Featured by the shop" products={market.featured} />
      ) : null}
      {!filtering && market.recent.length > 0 ? (
        <ProductSection title="Recently published" products={market.recent} />
      ) : null}
      {filtering ? (
        <ProductSection
          title={products.length === 0 ? "No matching products" : "Products"}
          products={products}
          empty="Nothing matched that search in the shops currently listed."
        />
      ) : products.length > 0 ? (
        <ProductSection title="Products" products={market.products} />
      ) : null}

      {filtering && (market.hasMore || page > 1) ? (
        <nav className="mt-8 flex items-center justify-between gap-4 border-t pt-6">
          {page > 1 ? (
            <Button asChild variant="outline">
              <Link
                to="/market"
                search={{
                  q: search.q ?? "",
                  category: market.category,
                  shop: selectedShop,
                  page: page - 1,
                }}
              >
                Previous
              </Link>
            </Button>
          ) : (
            <span />
          )}
          <p className="text-sm text-muted-foreground">Page {page}</p>
          {market.hasMore ? (
            <Button asChild variant="outline">
              <Link
                to="/market"
                search={{
                  q: search.q ?? "",
                  category: market.category,
                  shop: selectedShop,
                  page: page + 1,
                }}
              >
                Next
              </Link>
            </Button>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </MarketFrame>
  );
}

function ProductSection({
  title,
  products,
  empty,
}: {
  title: string;
  products: MarketplaceProduct[];
  empty?: string;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold">{title}</h2>
      {products.length === 0 && empty ? (
        <p className="mt-3 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((product) => (
            <a
              key={`${product.storeSlug}-${product.slug}`}
              href={storePublicUrl(product.storeSlug, `/products/${product.slug}`)}
              className="overflow-hidden rounded-lg border transition-shadow hover:shadow-md"
            >
              {product.imageUrl ? (
                <img src={product.imageUrl} alt="" className="aspect-square w-full object-cover" />
              ) : (
                <div className="aspect-square bg-muted" />
              )}
              <div className="space-y-1 p-3">
                <p className="line-clamp-2 text-sm font-medium">{product.name}</p>
                <p className="text-sm">{formatMoney(product.price, product.currency)}</p>
                <p className="text-xs text-muted-foreground">{product.storeName}</p>
                <p className="text-xs text-muted-foreground">{product.stockLabel}</p>
              </div>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

function MarketFrame({ children }: { children: ReactNode }) {
  return (
    <CustomerShoppingShell>
      <p className="text-sm text-muted-foreground">{BRAND.name} marketplace</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Find a local shop</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Every product belongs to one business. Checkout stays with that shop, and the stock you see
        is the same stock the shop uses at the counter.
      </p>
      {children}
    </CustomerShoppingShell>
  );
}
