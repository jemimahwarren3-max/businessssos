import { Link } from "@tanstack/react-router";
import type { PublishedShop } from "@/lib/storefront/published-shops";

type Shop = PublishedShop;

/** Real published shop only. Never pass a hardcoded demo shop. */
export function PublishedShopCard({ shop }: { shop: Shop }) {
  return (
    <Link
      to="/store/$slug"
      params={{ slug: shop.slug }}
      className="surface block overflow-hidden p-0 transition-colors hover:bg-muted/40"
    >
      {shop.logoUrl ? (
        <img src={shop.logoUrl} alt="" className="h-28 w-full object-cover bg-muted" />
      ) : (
        <div className="h-28 bg-muted" />
      )}
      <div className="p-4">
        <p className="font-medium">{shop.storeName}</p>
        <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
          {shop.businessType}
        </p>
        {shop.tagline ? (
          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{shop.tagline}</p>
        ) : null}
        {shop.address ? <p className="mt-2 text-sm text-muted-foreground">{shop.address}</p> : null}
      </div>
    </Link>
  );
}

export function PublishedShopGrid({ shops }: { shops: Shop[] }) {
  if (shops.length === 0) return <PublishedShopsEmpty />;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {shops.map((shop) => (
        <PublishedShopCard key={shop.slug} shop={shop} />
      ))}
    </div>
  );
}

export function PublishedShopsEmpty() {
  return (
    <section className="rounded-lg border border-dashed p-8">
      <h2 className="text-lg font-semibold">No shops are listed yet</h2>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        This grid loads published shops from the database. It stays empty until a merchant publishes
        and lists their shop. Nothing here is a demo catalogue.
      </p>
      <Link
        to="/auth"
        search={{ mode: "signup" }}
        className="mt-4 inline-block text-sm text-primary"
      >
        Open a shop
      </Link>
    </section>
  );
}
