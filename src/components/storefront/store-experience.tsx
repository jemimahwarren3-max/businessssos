import { Link } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { readCart, writeCart, type CartLine } from "@/lib/storefront/cart";
import { ListingReportForm } from "@/components/storefront/listing-report-form";
import { ProductReviewsBlock } from "@/components/storefront/product-reviews";
import { StoreReviewForm } from "@/components/storefront/review-form";
import type { ProductReviews, PublicProduct, PublicStore } from "@/lib/storefront/contract";
import { getProductReviewsFn } from "@/lib/storefront/storefront.functions";
import { getTemplate } from "@/lib/storefront/templates";
import { storeSurface } from "@/lib/storefront/store-surface";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import {
  readRecentlyViewed,
  readWishlist,
  recordRecentlyViewed,
  toggleWishlist,
} from "@/lib/storefront/shopper-tools";
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

function fontPairStacks(pair: PublicStore["theme"]["fontPair"], templateFont: string) {
  switch (pair) {
    case "editorial":
      return {
        body: "Georgia, 'Times New Roman', serif",
        heading: "Georgia, 'Times New Roman', serif",
      };
    case "humanist":
      return { body: "'Trebuchet MS', Arial, sans-serif", heading: "Georgia, serif" };
    case "geometric":
      return {
        body: "'Century Gothic', Arial, sans-serif",
        heading: "'Century Gothic', Arial, sans-serif",
      };
    case "rounded":
      return {
        body: "'Arial Rounded MT Bold', Arial, sans-serif",
        heading: "'Arial Rounded MT Bold', Arial, sans-serif",
      };
    case "mono":
      return {
        body: "ui-monospace, SFMono-Regular, Consolas, monospace",
        heading: "ui-monospace, Consolas, monospace",
      };
    default:
      return {
        body: `"${templateFont}", Inter, sans-serif`,
        heading: `"${templateFont}", Inter, sans-serif`,
      };
  }
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
  const theme = store.theme;
  const fonts = fontPairStacks(theme.fontPair, template.fontFamily);
  const accent = theme.accent || store.accentColor || template.defaultAccent;
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
        template.navigationStyle === "centered" && "w-full justify-center",
        template.navigationStyle === "editorial" && "justify-end gap-6",
        template.navigationStyle === "compact" && "gap-2 text-xs",
        template.navigationStyle === "left" && "order-first justify-start",
        template.navigationStyle === "quiet" && "gap-6 text-xs",
      )}
      style={{ color: theme.link }}
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
        backgroundColor: theme.background,
        color: theme.text,
        fontFamily: fonts.body,
        ["--store-primary" as string]: theme.primary,
        ["--store-accent" as string]: accent,
        ["--store-background" as string]: theme.background,
        ["--store-surface" as string]: theme.surface,
        ["--store-text" as string]: theme.text,
        ["--store-button" as string]: theme.button,
        ["--store-button-text" as string]: theme.buttonText,
        ["--store-link" as string]: theme.link,
      }}
    >
      {theme.sections.announcement && store.content.announcement ? (
        <p
          className="px-4 py-2 text-center text-sm font-medium"
          style={{ backgroundColor: theme.primary, color: theme.buttonText }}
        >
          {store.content.announcement}
        </p>
      ) : null}
      {preview ? (
        <p className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-950">
          Draft preview. Customers cannot see this shop until you publish it.
        </p>
      ) : null}
      <header
        className={cn(
          "sticky top-0 z-20",
          surface.header,
          template.navigationStyle === "centered" && "text-center",
          template.navigationStyle === "quiet" && "border-b-0",
        )}
        style={{ backgroundColor: theme.surface }}
      >
        <div
          className={cn(
            surface.inner,
            template.navigationStyle === "centered" && "flex-col",
            template.navigationStyle === "left" && "flex-row-reverse",
            template.navigationStyle === "compact" && "py-2",
          )}
        >
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
              <span
                className={cn("block truncate", surface.name)}
                style={{ color: theme.primary, fontFamily: fonts.heading }}
              >
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
      <footer className={surface.footer} style={{ backgroundColor: theme.surface }}>
        <div
          className="mx-auto grid max-w-6xl gap-6 px-4 py-10 text-sm md:grid-cols-3"
          style={{ color: theme.text }}
        >
          <div>
            <p className="font-medium">{store.storeName}</p>
            {theme.sections.about && store.about ? (
              <p className="mt-2 whitespace-pre-wrap opacity-80">{store.about}</p>
            ) : null}
            {store.address ? (
              <a
                className="mt-2 block underline-offset-2 hover:underline"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address)}`}
                target="_blank"
                rel="noreferrer"
              >
                {store.address} · View map
              </a>
            ) : null}
            {store.phone ? (
              <a className="block" href={`tel:${store.phone}`}>
                {store.phone}
              </a>
            ) : null}
            {store.email ? (
              <a className="block" href={`mailto:${store.email}`}>
                {store.email}
              </a>
            ) : null}
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
            {store.content.deliveryPolicy ? (
              <div>
                <p className="font-medium">Delivery and collection</p>
                <p className="mt-2 whitespace-pre-wrap">{store.content.deliveryPolicy}</p>
              </div>
            ) : null}
            {store.content.returnsPolicy ? (
              <div className="mt-4">
                <p className="font-medium">Returns and refunds</p>
                <p className="mt-2 whitespace-pre-wrap">{store.content.returnsPolicy}</p>
              </div>
            ) : null}
            {store.content.privacyPolicy ? (
              <div className="mt-4">
                <p className="font-medium">Privacy</p>
                <p className="mt-2 whitespace-pre-wrap">{store.content.privacyPolicy}</p>
              </div>
            ) : null}
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
                style={{ color: theme.link }}
                href={whatsapp}
                target="_blank"
                rel="noreferrer"
              >
                Message on WhatsApp
              </a>
            ) : null}
            {store.socials.website ? (
              <a className="block" style={{ color: theme.link }} href={store.socials.website}>
                Website
              </a>
            ) : null}
            {store.socials.instagram ? (
              <a className="block" style={{ color: theme.link }} href={store.socials.instagram}>
                Instagram
              </a>
            ) : null}
            {store.socials.facebook ? (
              <a className="block" style={{ color: theme.link }} href={store.socials.facebook}>
                Facebook
              </a>
            ) : null}
            {store.socials.tiktok ? (
              <a
                className="block"
                style={{ color: theme.link }}
                href={store.socials.tiktok}
                target="_blank"
                rel="noreferrer"
              >
                TikTok
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
          style={{ background: theme.button, color: theme.buttonText }}
        >
          WhatsApp
        </a>
      ) : null}
    </div>
  );
}

export function ProductCard({ store, product }: { store: PublicStore; product: PublicProduct }) {
  const template = getTemplate(store.templateId);
  const { theme } = store;
  const preview = useStorePreview();
  return (
    <Link
      to="/store/$slug/products/$productSlug"
      params={{ slug: store.slug, productSlug: product.slug }}
      search={preview ? { preview: "1" } : {}}
      className={cn(
        "group block overflow-hidden border",
        template.cardStyle === "minimal" && "border-0",
        template.cardStyle === "overlay" && "rounded-none",
        template.cardStyle === "floating" && "rounded-xl shadow-sm",
        template.cardStyle === "framed" && "rounded-md border-2",
        template.cardStyle !== "overlay" && template.cardStyle !== "minimal" && "rounded-lg",
      )}
      style={{
        backgroundColor: theme.surface,
        color: theme.text,
        borderColor: theme.accent + "40",
      }}
    >
      <div
        className={cn("bg-neutral-100", ratioClass(template.imageRatio))}
        style={{ backgroundColor: theme.surface }}
      >
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
        <p className="mt-1 text-sm" style={{ color: theme.primary }}>
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
  const { theme } = store;
  const [category, setCategory] = useState<string>("all");
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  useEffect(() => {
    setWishlistIds(readWishlist(store.slug));
    setRecentIds(readRecentlyViewed(store.slug));
  }, [store.slug]);
  const products = useMemo(() => {
    return store.products.filter(
      (product) => category === "all" || product.categoryId === category,
    );
  }, [store.products, category]);
  const grouped = template.layout === "menu";
  const grid = {
    editorial: "grid-cols-1 sm:grid-cols-2",
    masonry: "grid-cols-2 md:grid-cols-3",
    standard: "grid-cols-2 md:grid-cols-3",
    wide: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    rows: "grid-cols-1",
    compact: "grid-cols-2 md:grid-cols-4",
  }[template.catalogStyle];

  const featuredProducts = store.products.filter((product) => product.featured).slice(0, 3);
  const featured = featuredProducts[0] ?? store.products[0];
  const title = store.heroTitle || store.storeName;
  const blurb = store.heroSubtitle || store.about || store.tagline;
  const heroImage = theme.coverUrl || featured?.imageUrl;
  const fonts = fontPairStacks(theme.fontPair, template.fontFamily);
  const heroText = (
    <div className="relative px-6 py-10 md:px-12">
      <p
        className="text-xs font-semibold uppercase tracking-[0.18em]"
        style={{ color: theme.accent }}
      >
        {template.categoryName}
      </p>
      <h1
        className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight"
        style={{ color: theme.primary, fontFamily: fonts.heading }}
      >
        {title}
      </h1>
      {blurb ? <p className="mt-3 max-w-xl opacity-80">{blurb}</p> : null}
      {template.layout === "services" ? (
        <p className="mt-4 max-w-xl text-sm opacity-70">
          Placing an order does not deliver a download or confirm a booking. The business fulfils it
          after review.
        </p>
      ) : null}
    </div>
  );

  return (
    <div>
      {theme.sections.hero ? (
        template.heroStyle === "split" ? (
          <section
            className="grid md:grid-cols-2 md:items-center"
            style={{ backgroundColor: theme.surface }}
          >
            {heroImage ? (
              <div className="aspect-[4/3] md:aspect-auto md:min-h-[28rem]">
                <img src={heroImage} alt="" className="h-full w-full object-cover" />
              </div>
            ) : null}
            {heroText}
          </section>
        ) : template.heroStyle === "full-bleed" ? (
          <section className="relative overflow-hidden" style={{ backgroundColor: theme.surface }}>
            {heroImage ? (
              <img
                src={heroImage}
                alt=""
                className="absolute inset-0 h-full max-h-[30rem] w-full object-cover opacity-15"
              />
            ) : null}
            {heroText}
          </section>
        ) : template.heroStyle === "centered" ? (
          <section
            className="mx-auto max-w-4xl px-4 py-14 text-center"
            style={{ backgroundColor: theme.surface }}
          >
            {heroText}
          </section>
        ) : template.heroStyle === "compact" ? (
          <section
            className="mx-auto max-w-6xl px-4 py-7"
            style={{ backgroundColor: theme.surface }}
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              {heroText}
              {heroImage ? (
                <img src={heroImage} alt="" className="h-24 w-36 rounded-md object-cover" />
              ) : null}
            </div>
          </section>
        ) : template.heroStyle === "side-panel" ? (
          <section
            className="grid md:grid-cols-[0.8fr_1.2fr]"
            style={{ backgroundColor: theme.surface }}
          >
            <div className="flex flex-col justify-center">{heroText}</div>
            {heroImage ? (
              <img
                src={heroImage}
                alt=""
                className="h-64 w-full object-cover md:h-full md:min-h-80"
              />
            ) : null}
          </section>
        ) : (
          <section
            className="mx-auto max-w-5xl px-4 py-12"
            style={{ backgroundColor: theme.surface }}
          >
            {heroText}
          </section>
        )
      ) : null}
      {theme.sections.categories && store.categories.length > 0 ? (
        <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 pb-4">
          <button
            className={cn("rounded-full border px-3 py-1 text-sm")}
            style={
              category === "all"
                ? { background: theme.button, color: theme.buttonText, borderColor: theme.button }
                : { color: theme.text, borderColor: theme.accent + "70" }
            }
            onClick={() => setCategory("all")}
          >
            All
          </button>
          {store.categories.map((item) => (
            <button
              key={item.id}
              className={cn("rounded-full border px-3 py-1 text-sm")}
              style={
                category === item.id
                  ? { background: theme.button, color: theme.buttonText, borderColor: theme.button }
                  : { color: theme.text, borderColor: theme.accent + "70" }
              }
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
      {theme.sections.featured && featuredProducts.length > 0 ? (
        <section className="mx-auto max-w-6xl px-4 py-6">
          <h2 className="mb-3 text-lg font-semibold" style={{ color: theme.primary }}>
            Featured collection
          </h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {featuredProducts.map((product) => (
              <ProductCard key={product.id} store={store} product={product} />
            ))}
          </div>
        </section>
      ) : null}
      {theme.sections.promoTiles && store.content.promoTiles.length > 0 ? (
        <section className="mx-auto grid max-w-6xl gap-4 px-4 py-6 sm:grid-cols-2">
          {store.content.promoTiles.map((tile) => {
            const category = store.categories.find((item) => item.name === tile.categoryName);
            const matching = store.products.filter(
              (product) => product.categoryId === category?.id,
            );
            return (
              <div
                key={tile.id}
                className="relative min-h-40 overflow-hidden rounded-xl"
                style={{ backgroundColor: theme.surface }}
              >
                {tile.imageUrl ? (
                  <img
                    src={tile.imageUrl}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover opacity-35"
                  />
                ) : null}
                <div className="relative p-6">
                  <h2 className="text-xl font-semibold" style={{ color: theme.primary }}>
                    {tile.title}
                  </h2>
                  <p className="mt-1 text-sm">{tile.subtitle}</p>
                  {category ? (
                    <button
                      className="mt-4 rounded-md px-3 py-2 text-sm font-medium"
                      style={{ backgroundColor: theme.button, color: theme.buttonText }}
                      onClick={() => setCategory(category.id)}
                    >
                      Explore {tile.categoryName} ({matching.length})
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </section>
      ) : null}
      {theme.sections.collections && store.content.collections.length > 0 ? (
        <div className="space-y-3">
          {store.content.collections.map((collection) => {
            const category = store.categories.find((item) => item.name === collection.categoryName);
            const items = store.products
              .filter((product) => product.categoryId === category?.id)
              .slice(0, 4);
            if (!items.length || !collection.title) return null;
            return (
              <section key={collection.id} className="mx-auto max-w-6xl px-4 py-5">
                <div className="mb-3">
                  <h2 className="text-xl font-semibold" style={{ color: theme.primary }}>
                    {collection.title}
                  </h2>
                  {collection.description ? (
                    <p className="mt-1 text-sm opacity-75">{collection.description}</p>
                  ) : null}
                </div>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  {items.map((product) => (
                    <ProductCard key={product.id} store={store} product={product} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : null}
      {products.length === 0 ? (
        <p className="mx-auto max-w-6xl px-4 py-16 opacity-70">
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
        <div
          className={cn(
            "mx-auto grid max-w-6xl gap-4 px-4 pb-16",
            grid,
            template.catalogStyle === "masonry" && "md:[&>a:nth-child(3n+2)]:mt-8",
          )}
          data-catalog-style={template.catalogStyle}
        >
          {products.map((product) => (
            <ProductCard key={product.id} store={store} product={product} />
          ))}
        </div>
      )}
      {theme.sections.faqs && store.content.faqs.some((faq) => faq.question && faq.answer) ? (
        <section className="mx-auto max-w-4xl space-y-3 px-4 pb-12">
          <h2 className="text-xl font-semibold" style={{ color: theme.primary }}>
            Frequently asked questions
          </h2>
          {store.content.faqs
            .filter((faq) => faq.question && faq.answer)
            .map((faq) => (
              <details key={faq.question} className="rounded-lg border p-4">
                <summary className="cursor-pointer font-medium">{faq.question}</summary>
                <p className="mt-3 whitespace-pre-wrap text-sm opacity-80">{faq.answer}</p>
              </details>
            ))}
        </section>
      ) : null}
      {wishlistIds.length > 0 ? (
        <ProductShelf
          title="Saved for later"
          ids={wishlistIds}
          store={store}
          onRemove={(id) => setWishlistIds(toggleWishlist(store.slug, id))}
        />
      ) : null}
      {recentIds.length > 0 ? (
        <ProductShelf title="Recently viewed" ids={recentIds} store={store} />
      ) : null}
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
  const { theme } = store;
  const [qty, setQty] = useState(product.minQty);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const images = useMemo(
    () =>
      [product.imageUrl, ...product.galleryUrls].filter((image): image is string => Boolean(image)),
    [product.galleryUrls, product.imageUrl],
  );
  const [selectedImage, setSelectedImage] = useState(images[0] ?? null);
  const [currentReviews, setCurrentReviews] = useState(reviews);
  const loadReviews = useServerFn(getProductReviewsFn);
  const max = Math.max(product.minQty, product.maxPurchasable || product.minQty);
  const related = store.products
    .filter((item) => item.id !== product.id && item.categoryId === product.categoryId)
    .slice(0, 4);
  const [share, setShare] = useState("");
  useEffect(() => {
    setShare(window.location.href);
    setSaved(readWishlist(store.slug).includes(product.id));
    recordRecentlyViewed(store.slug, product.id);
    setSelectedImage(images[0] ?? null);
  }, [images, product.id, store.slug]);
  useEffect(() => {
    setCurrentReviews(reviews);
  }, [reviews]);

  async function refreshReviews() {
    setCurrentReviews(await loadReviews({ data: { slug: store.slug, productId: product.id } }));
  }

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
      <div
        className={cn("bg-neutral-100", ratioClass(template.imageRatio))}
        style={{ backgroundColor: theme.surface }}
      >
        {selectedImage ? (
          <img src={selectedImage} alt={product.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full min-h-64 items-center justify-center text-sm text-neutral-400">
            No photo
          </div>
        )}
        {images.length > 1 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {images.map((image, index) => (
              <button
                key={image}
                type="button"
                className={cn(
                  "size-16 overflow-hidden rounded border-2",
                  selectedImage === image ? "border-current" : "border-transparent",
                )}
                style={{ color: theme.primary }}
                aria-label={`Show product photo ${index + 1}`}
                aria-pressed={selectedImage === image}
                onClick={() => setSelectedImage(image)}
              >
                <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div>
        <h1 className="text-3xl font-semibold">{product.name}</h1>
        <p className="mt-3 text-xl" style={{ color: theme.primary }}>
          {formatMoney(product.price, product.currency)}
          {product.unit && product.unit !== "unit" ? ` per ${product.unit}` : ""}
        </p>
        <p className="mt-2 text-sm text-neutral-500">{product.stockLabel}</p>
        {store.content.deliveryPolicy || store.content.returnsPolicy ? (
          <div className="mt-5 space-y-3 rounded-lg border p-4 text-sm">
            {store.content.deliveryPolicy ? (
              <div>
                <h2 className="font-semibold">Delivery and collection</h2>
                <p className="mt-1 whitespace-pre-wrap opacity-80">
                  {store.content.deliveryPolicy}
                </p>
              </div>
            ) : null}
            {store.content.returnsPolicy ? (
              <div>
                <h2 className="font-semibold">Returns and refunds</h2>
                <p className="mt-1 whitespace-pre-wrap opacity-80">{store.content.returnsPolicy}</p>
              </div>
            ) : null}
          </div>
        ) : null}
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
            className="rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-50"
            style={{ background: theme.button, color: theme.buttonText }}
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
        <button
          type="button"
          className="ml-4 mt-4 text-sm underline"
          aria-pressed={saved}
          onClick={() => {
            const next = toggleWishlist(store.slug, product.id);
            setSaved(next.includes(product.id));
          }}
        >
          {saved ? "Remove from saved items" : "Save for later"}
        </button>
        <ProductReviewsBlock reviews={currentReviews} />
        <div className="mt-6 rounded-lg border p-4">
          <h2 className="mb-3 text-sm font-semibold">Have you bought this?</h2>
          <StoreReviewForm
            slug={store.slug}
            reference=""
            token=""
            productId={product.id}
            productName={product.name}
            askForOrderAccess
            onSaved={refreshReviews}
          />
        </div>
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

function ProductShelf({
  title,
  ids,
  store,
  onRemove,
}: {
  title: string;
  ids: string[];
  store: PublicStore;
  onRemove?: (id: string) => void;
}) {
  const products = ids
    .map((id) => store.products.find((product) => product.id === id))
    .filter((product): product is PublicProduct => Boolean(product));
  if (!products.length) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 pb-8">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {products.map((product) => (
          <div key={product.id}>
            <ProductCard store={store} product={product} />
            {onRemove ? (
              <button
                type="button"
                className="mt-1 text-xs underline"
                onClick={() => onRemove(product.id)}
              >
                Remove saved item
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function useCartCount(slug: string) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    setCount(readCart(slug).reduce((sum, line) => sum + line.quantity, 0));
  }, [slug]);
  return count;
}
