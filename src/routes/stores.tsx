import { createFileRoute, Link } from "@tanstack/react-router";
import { CustomerShoppingShell } from "@/components/storefront/customer-shopping-shell";
import { PublishedShopGrid } from "@/components/storefront/published-shop-card";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";
import { EMPTY_MARKETPLACE } from "@/lib/storefront/contract";
import { getMarketplaceFn } from "@/lib/storefront/storefront.functions";

export const Route = createFileRoute("/stores")({
  loader: async () => {
    try {
      return await getMarketplaceFn({ data: {} });
    } catch {
      return EMPTY_MARKETPLACE;
    }
  },
  head: () => ({
    meta: [
      { title: `Shops | ${BRAND.name}` },
      {
        name: "description",
        content: `Browse published shops on ${BRAND.name}. Every card is a real business, not a demo catalogue.`,
      },
      { property: "og:title", content: `Shops on ${BRAND.name}` },
    ],
  }),
  component: StoresPage,
  errorComponent: StoresError,
});

function StoresError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : "Something unexpected happened.";
  return (
    <CustomerShoppingShell>
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Shops</h1>
      <p className="mt-3 text-sm text-destructive">{message}</p>
    </CustomerShoppingShell>
  );
}

function StoresPage() {
  const market = Route.useLoaderData();
  return (
    <CustomerShoppingShell>
      <p className="text-sm text-muted-foreground">{BRAND.name} shops</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">Published shops</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        These shops opted into the public directory after they published. Search products on the
        marketplace, or open a shop to see its live catalogue.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link to="/market" search={{ q: "", category: "" }}>
            Search products
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/market/carts">Your carts</Link>
        </Button>
      </div>
      <div className="mt-10">
        {market.shops.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No shops are listed in the directory yet. Draft or suspended shops never appear here.
          </p>
        ) : (
          <PublishedShopGrid shops={market.shops} />
        )}
      </div>
    </CustomerShoppingShell>
  );
}
