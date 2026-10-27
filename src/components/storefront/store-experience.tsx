import { Link } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { readCart, writeCart, type CartLine } from "@/lib/storefront/cart";
import { ListingReportForm } from "@/components/storefront/listing-report-form";
import { ProductReviewsBlock } from "@/components/storefront/product-reviews";
import type { ProductReviews, PublicProduct, PublicStore } from "@/lib/storefront/contract";
import { getTemplate } from "@/lib/storefront/templates";
import { storeSurface } from "@/lib/storefront/store-surface";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { formatMoney } from "@/lib/format";
import { WEEKDAYS } from "@/lib/storefront/clocks";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

const StorePreviewContext = createContext(false);

export function StorePreviewProvider({
  preview,
  children,
}: {
  preview: boolean;
  children: React.ReactNode;
}) {
  return <StorePreviewContext.Provider value={preview}>{children}</StorePreviewContext.Provider>;
}

function useStorePreview() {
  return useContext(StorePreviewContext);
}

function ratioClass(ratio: "square" | "portrait" | "landscape") {
  if (ratio === "portrait") return "aspect-[3/4]";
  if (ratio === "landscape") return "aspect-[4/3]";
  return "aspect-square";
}

export function StoreChrome({
  store,
  preview,
  children,
}: {
  store: PublicStore;
  preview: boolean;
  children: React.ReactNode;
}) {
  const template = getTemplate(store.templateId);
  const surface = storeSurface(template.layout);
  const accent = store.accentColor || template.defaultAccent;
  const count = useCartCount(store.slug);
  const previewSearch = preview ? { preview: "1" as const } : {};
  const whatsapp = buildWhatsAppLink(
    store.whatsapp || store.phone,
    `Hello ${store.storeName}, I have a question about your shop.`,
  );

  const nav = (
    <nav
      className={cn(
        "flex shrink-0 items-center gap-4 text-sm font-medium",
        surface.centered && "justify-center",
      )}
    >
      <Link
        to="/store/$slug/search"
        params={{ slug: store.slug }}
        search={preview ? { q: "", preview: "1" } : { q: "" }}
      >
        Search
      </Link>
      <Link
        to="/store/$slug/account"
        params={{ slug: store.slug }}
        search={preview ? { preview: "1" } : {}}
      >
        Orders
      </Link>
      <Link
        to="/store/$slug/cart"
        params={{ slug: store.slug }}
        search={preview ? { preview: "1" } : {}}
      >
        Cart{count > 0 ? ` (${count})` : ""}
      </Link>
    </nav>
  );

  return (
    <div
      className={cn("min-h-screen", surface.page)}
      style={{
        fontFamily: `"${template.fontFamily}", Inter, sans-serif`,
        ["--store-accent" as string]: accent,
      }}
    >
      {preview ? (
        <p className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-950">
          Draft preview. Customers cannot see this shop until you publish it.
        </p>
      ) : null}
      <header className={cn("sticky top-0 z-20", surface.header)}>
        <div className={surface.inner}>
          <Link
            to="/store/$slug"
            params={{ slug: store.slug }}
            search={previewSearch}
            className={cn("min-w-0", surface.centered ? "w-full" : "flex-1")}
          >
            {store.logoUrl ? (
              <img
                src={store.logoUrl}
                alt={store.storeName}
                className={cn("h-10 w-auto object-contain", surface.centered && "mx-auto")}
              />
            ) : (
              <span className={cn("block truncate", surface.name)} style={{ color: accent }}>
                {store.storeName}
              </span>
            )}
            {store.tagline && !surface.centered ? (
              <span className="mt-0.5 block truncate text-xs text-neutral-500">
                {store.tagline}
              </span>
            ) : null}
          </Link>
          {nav}
        </div>
      </header>
      <main id="main-content">{children}</main>
      <footer className={surface.footer}>
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 text-sm text-neutral-600 md:grid-cols-3">
          <div>
            <p className="font-medium text-neutral-900">{store.storeName}</p>
            {store.address ? <p className="mt-2">{store.address}</p> : null}
            {store.phone ? <p>{store.phone}</p> : null}
            {store.hours ? <p className="mt-2 whitespace-pre-wrap">{store.hours}</p> : null}
            {(store.delivery.weeklyHours ?? []).length > 0 ? (
              <ul className="mt-2 space-y-0.5">
                {store.delivery.weeklyHours.map((row) => (
                  <li key={row.weekday}>
                    {WEEKDAYS.find((day) => day.weekday === row.weekday)?.short} {row.open} to{" "}
                    {row.close}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div>
            {store.policies ? (
              <>
                <p className="font-medium text-neutral-900">Policies</p>
                <p className="mt-2 whitespace-pre-wrap">{store.policies}</p>
              </>
            ) : (
              <p>Policies have not been added yet.</p>
            )}
          </div>
          <div className="space-y-2">
            {whatsapp ? (
              <a
                className="block font-medium"
                style={{ color: accent }}
                href={whatsapp}
                target="_blank"
                rel="noreferrer"
              >
                Message on WhatsApp
              </a>
            ) : null}
            {store.socials.website ? (
              <a className="block" href={store.socials.website}>
                Website
              </a>
            ) : null}
            {store.socials.instagram ? (
              <a className="block" href={store.socials.instagram}>
                Instagram
              </a>
            ) : null}
            {store.socials.facebook ? (
              <a className="block" href={store.socials.facebook}>
                Facebook
              </a>
            ) : null}
            {preview ? null : <ListingReportForm slug={store.slug} />}
            <p className="pt-4 text-xs text-neutral-400">
              Store on{" "}
              <Link to="/" className="underline-offset-2 hover:underline">
                {BRAND.name}
              </Link>
            </p>
          </div>
        </div>
      </footer>
      {template.layout === "social" && whatsapp ? (
        <a
          href={whatsapp}
          className="fixed bottom-4 right-4 rounded-full px-4 py-3 text-sm font-semibold text-white shadow-lg"
          style={{ background: accent }}
        >
          WhatsApp
        </a>
      ) : null}
    </div>
  );
}

export function ProductCard({ store, product }: { store: PublicStore; product: PublicProduct }) {
  const template = getTemplate(store.templateId);
  const accent = store.accentColor || template.defaultAccent;
  const preview = useStorePreview();
  return (
    <Link
      to="/store/$slug/products/$productSlug"
      params={{ slug: store.slug, productSlug: product.slug }}
      search={preview ? { preview: "1" } : {}}
      className={cn(
        "group block overflow-hidden border border-neutral-200 bg-white",
        template.layout === "luxury" ? "border-0" : "rounded-lg",
      )}
    >
      <div className={cn("bg-neutral-100", ratioClass(template.imageRatio))}>
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-neutral-400">
            No photo
          </div>
        )}
      </div>
      <div className={cn("p-3", template.density === "compact" && "p-2")}>
        <p className="font-medium leading-snug">{product.name}</p>
        <p className="mt-1 text-sm" style={{ color: accent }}>
          {formatMoney(product.price, product.currency)}
          {product.unit && product.unit !== "unit" ? ` / ${product.unit}` : ""}
        </p>
        <p className="mt-1 text-xs text-neutral-500">{product.stockLabel}</p>
        {template.layout === "wholesale" ? (
          <p className="mt-1 text-xs text-neutral-500">Minimum {product.minQty}</p>
        ) : null}
      </div>
    </Link>
  );
}

export function Catalog({ store, query }: { store: PublicStore; query?: string }) {
  const template = getTemplate(store.templateId);
  const accent = store.accentColor || template.defaultAccent;
  const [category, setCategory] = useState<string>("all");
  const products = useMemo(() => {
    return store.products.filter(
      (product) => category === "all" || product.categoryId === category,
    );
  }, [store.products, category]);
  const grouped = template.layout === "menu";
  const grid =
    template.layout === "dense" || template.layout === "wholesale"
      ? "grid-cols-2 md:grid-cols-4"
      : template.layout === "editorial" || template.layout === "luxury"
        ? "grid-cols-1 sm:grid-cols-2"
        : "grid-cols-2 md:grid-cols-3";

  const featured = store.products.find((product) => product.featured) ?? store.products[0];
  const title = store.heroTitle || store.storeName;
  const blurb = store.heroSubtitle || store.about || store.tagline;

  return (
    <div>
      {template.layout === "editorial" && featured?.imageUrl ? (
        <section className="grid md:grid-cols-2">
          <div className="min-h-72 bg-neutral-200 md:min-h-[28rem]">
            <img src={featured.imageUrl} alt="" className="h-full w-full object-cover" />
          </div>
          <div className="flex flex-col justify-center px-6 py-12 md:px-12">
            <h1
              className="max-w-md text-4xl font-semibold tracking-tight"
              style={{ color: accent }}
            >
              {title}
            </h1>
            {blurb ? <p className="mt-4 max-w-md text-neutral-600">{blurb}</p> : null}
          </div>
        </section>
      ) : template.layout === "showcase" && featured?.imageUrl ? (
        <section>
          <div className="aspect-[21/9] max-h-[28rem] w-full bg-neutral-200">
            <img src={featured.imageUrl} alt="" className="h-full w-full object-cover" />
          </div>
          <div className="mx-auto max-w-6xl px-4 py-10">
            <h1 className="text-4xl font-semibold tracking-tight" style={{ color: accent }}>
              {title}
            </h1>
            {blurb ? <p className="mt-3 max-w-2xl text-neutral-600">{blurb}</p> : null}
          </div>
        </section>
      ) : template.layout === "luxury" ? (
        <section className="mx-auto max-w-xl px-4 py-20 text-center">
          <h1 className="text-4xl font-semibold tracking-tight" style={{ color: accent }}>
            {title}
          </h1>
          {blurb ? <p className="mt-4 text-neutral-600">{blurb}</p> : null}
        </section>
      ) : (
        <section
          className={cn(
            "mx-auto max-w-6xl px-4",
            template.density === "spacious" ? "py-16" : "py-8",
          )}
        >
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight" style={{ color: accent }}>
            {title}
          </h1>
          {blurb ? <p className="mt-3 max-w-xl text-neutral-600">{blurb}</p> : null}
          {template.layout === "services" ? (
            <p className="mt-4 max-w-xl text-sm text-neutral-500">
              Placing an order does not deliver a download or confirm a booking. The business
              fulfils it after review.
            </p>
          ) : null}
        </section>
      )}
      {store.categories.length > 0 ? (
        <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 pb-4">
          <button
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              category === "all" && "text-white",
            )}
            style={category === "all" ? { background: accent, borderColor: accent } : undefined}
            onClick={() => setCategory("all")}
          >
            All
          </button>
          {store.categories.map((item) => (
            <button
              key={item.id}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                category === item.id && "text-white",
              )}
              style={category === item.id ? { background: accent, borderColor: accent } : undefined}
              onClick={() => setCategory(item.id)}
            >
              {item.name}
            </button>
          ))}
        </div>
      ) : null}
      {query ? (
        <p className="mx-auto max-w-6xl px-4 pb-4 text-sm text-neutral-500">
          Results for “{query}”
        </p>
      ) : null}
      {products.length === 0 ? (
        <p className="mx-auto max-w-6xl px-4 py-16 text-neutral-500">
          No products are published in this view yet.
        </p>
      ) : grouped ? (
        <div className="mx-auto max-w-3xl space-y-8 px-4 pb-16">
          {store.categories.map((item) => {
            const rows = products.filter((product) => product.categoryId === item.id);
            if (rows.length === 0) return null;
            return (
              <section key={item.id}>
                <h2 className="mb-3 text-xl font-semibold">{item.name}</h2>
                <div className="divide-y border-y">
                  {rows.map((product) => (
                    <ProductCard key={product.id} store={store} product={product} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className={cn("mx-auto grid max-w-6xl gap-4 px-4 pb-16", grid)}>
          {products.map((product) => (
            <ProductCard key={product.id} store={store} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ProductView({
  store,
  product,
  reviews,
}: {
  store: PublicStore;
  product: PublicProduct;
  reviews: ProductReviews;
}) {
  const template = getTemplate(store.templateId);
  const accent = store.accentColor || template.defaultAccent;
  const [qty, setQty] = useState(product.minQty);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const max = Math.max(product.minQty, product.maxPurchasable || product.minQty);
  const related = store.products
    .filter((item) => item.id !== product.id && item.categoryId === product.categoryId)
    .slice(0, 4);
  const [share, setShare] = useState("");
  useEffect(() => {
    setShare(window.location.href);
  }, []);

  function add() {
    if (!product.available) {
      setMessage("This product is out of stock.");
      return;
    }
    if (qty < product.minQty || qty > max) {
      setMessage(`Choose between ${product.minQty} and ${max}.`);
      return;
    }
    const lines = readCart(store.slug).filter((line) => line.productId !== product.id);
    const next: CartLine = { productId: product.id, quantity: qty };
    if (note.trim()) next.note = note.trim().slice(0, 200);
    lines.push(next);
    writeCart(store.slug, lines);
    setMessage("Added to cart. The final total is calculated when you view the cart.");
  }

  return (
    <article className="mx-auto grid max-w-6xl gap-8 px-4 py-8 md:grid-cols-2">
      <div className={cn("bg-neutral-100", ratioClass(template.imageRatio))}>
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full min-h-64 items-center justify-center text-sm text-neutral-400">
            No photo
          </div>
        )}
      </div>
      <div>
        <h1 className="text-3xl font-semibold">{product.name}</h1>
        <p className="mt-3 text-xl" style={{ color: accent }}>
          {formatMoney(product.price, product.currency)}
          {product.unit && product.unit !== "unit" ? ` per ${product.unit}` : ""}
        </p>
        <p className="mt-2 text-sm text-neutral-500">{product.stockLabel}</p>
        {product.description ? (
          <p className="mt-4 whitespace-pre-wrap text-neutral-700">{product.description}</p>
        ) : null}
        {product.details ? (
          <div className="mt-4">
            <h2 className="text-sm font-semibold">Details from the seller</h2>
            <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700">{product.details}</p>
          </div>
        ) : null}
        {product.sizeGuide ? (
          <div className="mt-4">
            <h2 className="text-sm font-semibold">Size or specification notes</h2>
            <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700">{product.sizeGuide}</p>
          </div>
        ) : null}
        <p className="mt-4 text-xs text-neutral-500">
          This product has one price and one stock count. Notes do not create a separate variant.
        </p>
        {template.layout === "menu" || template.layout === "services" ? (
          <label className="mt-4 block text-sm">
            Note for the seller
            <textarea
              className="mt-1 w-full rounded-md border px-3 py-2"
              maxLength={200}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
        ) : null}
        <div className="mt-4 flex items-center gap-3">
          <label className="text-sm">
            Quantity
            <input
              className="ml-2 w-20 rounded-md border px-2 py-1"
              type="number"
              min={product.minQty}
              max={max}
              value={qty}
              onChange={(event) => setQty(Number(event.target.value))}
            />
          </label>
          <button
            type="button"
            className="rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: accent }}
            disabled={!product.available}
            onClick={add}
          >
            {template.layout === "services" ? "Add request" : "Add to cart"}
          </button>
        </div>
        {message ? <p className="mt-3 text-sm">{message}</p> : null}
        {share ? (
          <button
            type="button"
            className="mt-4 text-sm underline"
            onClick={() => void navigator.clipboard.writeText(share)}
          >
            Copy product link
          </button>
        ) : null}
        <ProductReviewsBlock reviews={reviews} />
        <div className="mt-8">
          <ListingReportForm slug={store.slug} productId={product.id} />
        </div>
        {related.length > 0 ? (
          <div className="mt-10">
            <h2 className="text-sm font-semibold">More in this category</h2>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {related.map((item) => (
                <ProductCard key={item.id} store={store} product={item} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function useCartCount(slug: string) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    setCount(readCart(slug).reduce((sum, line) => sum + line.quantity, 0));
  }, [slug]);
  return count;
}
