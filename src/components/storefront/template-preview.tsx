import { cn } from "@/lib/utils";
import type { StoreTemplate } from "@/lib/storefront/templates";
import { sampleProductsForCategory } from "@/lib/storefront/template-placeholders";
import { themeFromPalette } from "@/lib/storefront/theme";

function ProductTile({
  name,
  price,
  accent,
  surface,
  cardStyle,
  imageUrl,
}: {
  name: string;
  price: number;
  accent: string;
  surface: string;
  cardStyle: StoreTemplate["cardStyle"];
  imageUrl: string;
}) {
  if (cardStyle === "line") {
    return (
      <span
        className="flex items-center gap-1.5 border-b py-1"
        style={{ borderColor: `${accent}35` }}
      >
        <img src={imageUrl} alt="" className="size-5 rounded-sm object-cover" />
        <span className="min-w-0 flex-1 truncate text-[7px] font-medium">{name}</span>
        <span className="text-[7px]" style={{ color: accent }}>
          ${price}
        </span>
      </span>
    );
  }
  if (cardStyle === "overlay") {
    return (
      <span className="relative block overflow-hidden">
        <img src={imageUrl} alt="" className="h-10 w-full object-cover" />
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 px-1 py-0.5 text-[6px] text-white">
          {name}
        </span>
      </span>
    );
  }
  return (
    <span
      className={cn(
        "block overflow-hidden",
        cardStyle === "floating" && "rounded-md shadow-sm",
        cardStyle === "framed" && "rounded-sm border-2",
        cardStyle === "bordered" && "rounded-sm border",
        cardStyle === "minimal" && "rounded-none",
      )}
      style={{ background: surface, borderColor: `${accent}40` }}
    >
      <img src={imageUrl} alt="" className="h-8 w-full object-cover" />
      <span className="block truncate px-1 py-0.5 text-[6px] font-medium">{name}</span>
    </span>
  );
}

function Hero({
  template,
  title,
  accent,
  surface,
  imageUrl,
}: {
  template: StoreTemplate;
  title: string;
  accent: string;
  surface: string;
  imageUrl: string;
}) {
  const copy = (
    <span className="block min-w-0">
      <span className="block text-[6px] font-semibold uppercase tracking-[0.14em] opacity-60">
        {template.categoryName}
      </span>
      <span className="mt-0.5 block truncate text-[9px] font-semibold" style={{ color: accent }}>
        {title}
      </span>
      <span
        className="mt-1 inline-flex rounded-sm px-1.5 py-0.5 text-[6px] font-semibold text-white"
        style={{ background: accent }}
      >
        Shop now
      </span>
    </span>
  );

  if (template.heroStyle === "split") {
    return (
      <div className="grid grid-cols-2 items-stretch" style={{ background: surface }}>
        <img src={imageUrl} alt="" className="h-16 w-full object-cover" />
        <div className="flex items-center p-2">{copy}</div>
      </div>
    );
  }
  if (template.heroStyle === "full-bleed") {
    return (
      <div className="relative h-16 overflow-hidden">
        <img src={imageUrl} alt="" className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 bg-black/35" />
        <div className="relative flex h-full items-end p-2 text-white">{copy}</div>
      </div>
    );
  }
  if (template.heroStyle === "centered") {
    return (
      <div className="px-2 py-2 text-center" style={{ background: surface }}>
        {copy}
      </div>
    );
  }
  if (template.heroStyle === "compact") {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5" style={{ background: surface }}>
        <div className="min-w-0 flex-1">{copy}</div>
        <img src={imageUrl} alt="" className="h-10 w-14 rounded-sm object-cover" />
      </div>
    );
  }
  if (template.heroStyle === "side-panel") {
    return (
      <div className="grid grid-cols-[0.9fr_1.1fr]" style={{ background: surface }}>
        <div className="flex items-center p-2">{copy}</div>
        <img src={imageUrl} alt="" className="h-16 w-full object-cover" />
      </div>
    );
  }
  return (
    <div className="px-2 py-2" style={{ background: surface }}>
      {copy}
    </div>
  );
}

/** Miniature shop website for pickers — header, hero, and catalogue, not a photo card. */
export function TemplatePreview({
  template,
  className,
  storeName,
}: {
  template: StoreTemplate;
  className?: string;
  storeName?: string;
}) {
  const theme = themeFromPalette(template.defaultPalette, template.defaultAccent);
  const products = sampleProductsForCategory(template.category);
  const title = storeName || template.name;
  const columns =
    template.catalogStyle === "compact"
      ? "grid-cols-4"
      : template.catalogStyle === "rows" || template.cardStyle === "line"
        ? "grid-cols-1"
        : template.catalogStyle === "editorial" || template.catalogStyle === "wide"
          ? "grid-cols-2"
          : "grid-cols-3";

  return (
    <div
      className={cn("relative overflow-hidden rounded-lg border shadow-sm", className)}
      style={{
        background: theme.background,
        color: theme.text,
        fontFamily: `"${template.fontFamily}", Inter, sans-serif`,
      }}
      data-layout={template.layout}
      data-template={template.id}
      data-category={template.category}
      data-composition={template.heroStyle}
      aria-label={`${template.name} shop website`}
    >
      <div
        className="flex items-center gap-1 border-b px-2 py-1"
        style={{ background: theme.surface, borderColor: `${theme.accent}25` }}
      >
        <span className="size-1.5 rounded-full bg-neutral-300" />
        <span className="size-1.5 rounded-full bg-neutral-300" />
        <span className="truncate text-[7px] opacity-50">yourshop.mykwetuu.com</span>
      </div>
      <header
        className={cn(
          "flex items-center justify-between gap-2 px-2 py-1.5",
          template.navigationStyle === "centered" && "flex-col",
        )}
        style={{ background: theme.surface, color: theme.primary }}
      >
        <span className="truncate text-[9px] font-semibold">{title}</span>
        <span
          className={cn(
            "flex shrink-0 gap-1.5 text-[7px] font-medium",
            template.navigationStyle === "compact" && "text-[6px]",
          )}
        >
          <span>Shop</span>
          <span>Search</span>
          <span>Cart</span>
        </span>
      </header>
      <Hero
        template={template}
        title={title}
        accent={theme.primary}
        surface={theme.surface}
        imageUrl={template.previewImageUrl}
      />
      <div
        className={cn(
          "gap-1 p-1.5",
          template.catalogStyle === "rows" || template.cardStyle === "line"
            ? "flex flex-col"
            : "grid",
          columns,
        )}
      >
        {products.map((product) => (
          <ProductTile
            key={product.name}
            name={product.name}
            price={product.price}
            accent={theme.primary}
            surface={theme.surface}
            cardStyle={template.cardStyle}
            imageUrl={template.previewImageUrl}
          />
        ))}
      </div>
    </div>
  );
}
