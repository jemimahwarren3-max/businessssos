import { formatMoney } from "@/lib/format";
import type { AdminStore, StorefrontContent } from "@/lib/storefront/contract";
import type { StorefrontTheme } from "@/lib/storefront/theme";
import type { StoreTemplate } from "@/lib/storefront/templates";
import { cn } from "@/lib/utils";

type PreviewProduct = AdminStore["products"][number];

export function LiveTemplatePreview({
  template,
  storeName,
  currency,
  tagline,
  about,
  phone,
  email,
  address,
  policies,
  content,
  heroTitle,
  heroSubtitle,
  logoUrl,
  theme,
  products,
  viewport,
}: {
  template: StoreTemplate;
  storeName: string;
  currency: string;
  tagline: string;
  about: string;
  phone: string;
  email: string;
  address: string;
  policies: string;
  content: StorefrontContent;
  heroTitle: string;
  heroSubtitle: string;
  logoUrl: string;
  theme: StorefrontTheme;
  products: PreviewProduct[];
  viewport: "mobile" | "desktop";
}) {
  const publishedProducts = products.filter((product) => product.published);
  const categories = [
    ...new Set(
      publishedProducts
        .map((product) => product.categoryName)
        .filter((name): name is string => Boolean(name)),
    ),
  ];
  const featured = publishedProducts.filter((product) => product.featured);
  const heroImage =
    theme.coverUrl || featured[0]?.imageUrl || publishedProducts[0]?.imageUrl || null;
  const title = heroTitle || storeName || "Your shop";
  const description = heroSubtitle || tagline;
  const fontFamilies = {
    system: `"${template.fontFamily}", Inter, sans-serif`,
    editorial: "Georgia, 'Times New Roman', serif",
    humanist: "'Trebuchet MS', Arial, sans-serif",
    geometric: "'Century Gothic', Arial, sans-serif",
    rounded: "'Arial Rounded MT Bold', Arial, sans-serif",
    mono: "ui-monospace, SFMono-Regular, Consolas, monospace",
  };
  const columns =
    template.catalogStyle === "compact"
      ? "grid-cols-3"
      : template.catalogStyle === "wide" || template.catalogStyle === "masonry"
        ? "grid-cols-2"
        : "grid-cols-2";

  return (
    <div
      className={cn(
        "mx-auto overflow-hidden rounded-xl border shadow-sm transition-[max-width]",
        viewport === "mobile" ? "max-w-[390px]" : "max-w-5xl",
      )}
      style={{
        backgroundColor: theme.background,
        color: theme.text,
        fontFamily: fontFamilies[theme.fontPair],
      }}
      data-preview-viewport={viewport}
    >
      {theme.sections.announcement && content.announcement ? (
        <p
          className="px-3 py-2 text-center text-xs"
          style={{ backgroundColor: theme.primary, color: theme.buttonText }}
        >
          {content.announcement}
        </p>
      ) : null}
      <header
        className="flex items-center justify-between gap-4 border-b px-4 py-3"
        style={{ backgroundColor: theme.surface, borderColor: theme.accent + "30" }}
      >
        <div className="flex min-w-0 items-center gap-2">
          {logoUrl ? <img src={logoUrl} alt="" className="h-8 max-w-24 object-contain" /> : null}
          <div className="min-w-0">
            <p className="truncate font-semibold" style={{ color: theme.primary }}>
              {storeName || "Your shop"}
            </p>
            {tagline ? <p className="truncate text-xs opacity-70">{tagline}</p> : null}
          </div>
        </div>
        <nav aria-label="Store preview navigation" className="flex shrink-0 gap-3 text-xs">
          <span>Shop</span>
          {(template.catalogStyle === "standard" || template.heroStyle === "compact") && (
            <span className="font-semibold">Search</span>
          )}
          <span>Cart</span>
        </nav>
      </header>

      {(template.catalogStyle === "standard" || template.navigationStyle === "compact") && (
        <div className="px-4 py-2" style={{ backgroundColor: theme.surface }}>
          <div
            className="rounded-md border px-3 py-2 text-xs opacity-70"
            style={{ borderColor: theme.accent + "40" }}
          >
            Search products…
          </div>
        </div>
      )}

      {(template.density === "compact" || template.layout === "dense") && (phone || address) ? (
        <div
          className="flex flex-wrap gap-3 px-4 py-2 text-[11px] font-medium"
          style={{ backgroundColor: theme.primary, color: theme.buttonText }}
        >
          {phone ? <span>Call {phone}</span> : null}
          {address ? <span>Collect: {address}</span> : null}
        </div>
      ) : null}

      {theme.sections.hero ? (
        <section
          className={cn(
            "relative overflow-hidden px-5 py-8",
            template.heroStyle === "centered" && "text-center",
            template.heroStyle === "quiet" && "py-5",
            template.heroStyle === "split" &&
              viewport === "desktop" &&
              "md:grid md:grid-cols-2 md:items-center md:gap-5",
          )}
          style={{ backgroundColor: theme.surface }}
        >
          {heroImage && template.heroStyle === "full-bleed" ? (
            <img
              src={heroImage}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-25"
            />
          ) : null}
          <div className="relative">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-60">
              {template.categoryName}
            </p>
            <h3
              className={cn(
                "mt-2 text-2xl font-semibold tracking-tight",
                template.heroStyle === "quiet" && "text-lg",
              )}
              style={{ color: theme.primary }}
            >
              {title}
            </h3>
            {description ? <p className="mt-2 max-w-lg text-sm opacity-75">{description}</p> : null}
            <span
              className="mt-4 inline-flex rounded px-3 py-1.5 text-xs font-semibold"
              style={{ backgroundColor: theme.button, color: theme.buttonText }}
            >
              Explore collection
            </span>
          </div>
          {heroImage && template.heroStyle !== "full-bleed" ? (
            <img
              src={heroImage}
              alt=""
              className={cn(
                "relative mt-5 max-h-44 w-full rounded-md object-cover",
                template.heroStyle === "split" && viewport === "desktop" && "md:mt-0",
              )}
            />
          ) : null}
        </section>
      ) : null}

      {theme.sections.categories && categories.length > 0 ? (
        <div className="flex gap-2 overflow-hidden px-4 py-3">
          {["All", ...categories].map((label) => (
            <span
              key={label}
              className="shrink-0 rounded-full border px-3 py-1 text-[10px]"
              style={{ borderColor: theme.accent + "55", color: theme.link }}
            >
              {label}
            </span>
          ))}
        </div>
      ) : null}

      {theme.sections.featured && featured.length > 0 ? (
        <section className="px-4 py-3">
          <h4 className="mb-2 text-sm font-semibold">Featured</h4>
          <PreviewProductGrid products={featured.slice(0, 2)} theme={theme} template={template} />
        </section>
      ) : null}

      {theme.sections.promoTiles && content.promoTiles.length > 0 ? (
        <section className="grid gap-2 px-4 py-3 sm:grid-cols-2">
          {content.promoTiles.map((tile) => (
            <article
              key={tile.id}
              className="rounded-md border p-3 text-xs"
              style={{ borderColor: theme.accent + "40" }}
            >
              <p className="font-semibold">{tile.title}</p>
              <p className="mt-1 opacity-70">{tile.subtitle}</p>
            </article>
          ))}
        </section>
      ) : null}

      {theme.sections.collections && content.collections.length > 0 ? (
        <section className="space-y-2 px-4 py-3">
          {content.collections.map((collection) => (
            <p
              key={collection.id}
              className="rounded-md border p-2 text-xs"
              style={{ borderColor: theme.accent + "40" }}
            >
              <strong>{collection.title || "Collection"}</strong> · {collection.categoryName}
            </p>
          ))}
        </section>
      ) : null}

      <section className="px-4 py-4">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h4 className="text-sm font-semibold">Shop all</h4>
          <span className="text-[10px] opacity-60">{publishedProducts.length} products</span>
        </div>
        {publishedProducts.length > 0 ? (
          <div
            className={cn(
              "grid gap-3",
              columns,
              viewport === "desktop" && "md:grid-cols-4",
              template.catalogStyle === "rows" && "grid-cols-1",
            )}
          >
            {publishedProducts.slice(0, 4).map((product) => (
              <article
                key={product.id}
                className={cn(
                  "overflow-hidden border",
                  template.cardStyle === "floating" && "rounded-xl shadow-sm",
                  template.cardStyle === "line" && "border-x-0 border-t-0",
                  template.cardStyle === "overlay" && "rounded-none",
                  template.cardStyle !== "line" && "rounded-md",
                )}
                style={{ borderColor: theme.accent + "30", backgroundColor: theme.surface }}
              >
                <div className="aspect-square overflow-hidden bg-black/5">
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[10px] opacity-50">
                      No product image
                    </div>
                  )}
                </div>
                <div className="p-2">
                  <p className="truncate text-xs font-medium">{product.name}</p>
                  <p className="mt-1 text-xs" style={{ color: theme.primary }}>
                    {formatMoney(product.price, currency)}
                  </p>
                  <p className="mt-1 text-[10px] opacity-60">
                    {product.stock > 0 ? "In stock" : "Out of stock"}
                  </p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="rounded-md border border-dashed p-5 text-center text-xs opacity-70">
            Publish products from your catalogue to see them in this preview.
          </p>
        )}
      </section>

      {theme.sections.about ? (
        <footer
          className="border-t px-4 py-3 text-xs opacity-70"
          style={{ borderColor: theme.accent + "30" }}
        >
          {about ? <p className="whitespace-pre-wrap">{about}</p> : null}
          {address ? <p className="mt-2">{address}</p> : null}
          {phone ? <p className="mt-1">{phone}</p> : null}
          {email ? <p className="mt-1">{email}</p> : null}
          {policies ? <p className="mt-2 whitespace-pre-wrap">{policies}</p> : null}
          {content.deliveryPolicy ? (
            <p className="mt-2">Delivery: {content.deliveryPolicy}</p>
          ) : null}
          {content.returnsPolicy ? <p className="mt-2">Returns: {content.returnsPolicy}</p> : null}
          {!about && !address && !phone && !email && !policies ? (
            <p>Add your about text, contact details, or policies to preview them here.</p>
          ) : null}
        </footer>
      ) : null}
      {theme.sections.faqs && content.faqs.length > 0 ? (
        <section className="space-y-2 px-4 py-3">
          {content.faqs.map((faq, index) => (
            <p key={`${index}-${faq.question}`} className="text-xs">
              <strong>{faq.question || "FAQ question"}</strong> {faq.answer}
            </p>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function PreviewProductGrid({
  products,
  theme,
  template,
}: {
  products: PreviewProduct[];
  theme: StorefrontTheme;
  template: StoreTemplate;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {products.map((product) => (
        <article
          key={product.id}
          className="overflow-hidden rounded-md"
          style={{ backgroundColor: theme.surface }}
        >
          <div className="aspect-[4/3] bg-black/5">
            {product.imageUrl || product.galleryUrls[0] ? (
              <img
                src={product.imageUrl ?? product.galleryUrls[0]}
                alt={product.name}
                className="h-full w-full object-cover"
              />
            ) : null}
          </div>
          <p
            className="truncate p-2 text-xs font-medium"
            style={{ fontFamily: template.fontFamily }}
          >
            {product.name}
          </p>
        </article>
      ))}
    </div>
  );
}
