import { cn } from "@/lib/utils";
import type { StorefrontContent } from "@/lib/storefront/contract";
import type { StorefrontTheme } from "@/lib/storefront/theme";
import type { HeroStyle, StoreTemplate } from "@/lib/storefront/templates";

type PromoTile = StorefrontContent["promoTiles"][number];
type PromoCategory = { id: string; name: string };
type PromoLayout = "editorial" | "campaign" | "spotlight" | "strip" | "gallery" | "list";

const PROMO_LAYOUTS: Record<HeroStyle, PromoLayout> = {
  split: "editorial",
  "full-bleed": "campaign",
  centered: "spotlight",
  compact: "strip",
  "side-panel": "gallery",
  quiet: "list",
};

function promoLayoutClasses(layout: PromoLayout) {
  switch (layout) {
    case "campaign":
      return "relative min-h-52 overflow-hidden text-white";
    case "editorial":
      return "grid overflow-hidden sm:grid-cols-[0.8fr_1.2fr]";
    case "spotlight":
      return "flex flex-col overflow-hidden text-center";
    case "strip":
      return "flex min-h-28 items-center gap-4 overflow-hidden";
    case "gallery":
      return "grid overflow-hidden md:grid-cols-[1.2fr_0.8fr]";
    default:
      return "flex items-center gap-3 border-x-0 border-t-0";
  }
}

function promoImageClasses(layout: PromoLayout) {
  switch (layout) {
    case "campaign":
      return "absolute inset-0 h-full w-full object-cover";
    case "strip":
      return "h-20 w-24 shrink-0 object-cover";
    case "list":
      return "size-14 shrink-0 object-cover";
    case "spotlight":
      return "h-36 w-full object-cover";
    case "gallery":
      return "h-36 w-full object-cover md:h-full";
    default:
      return "h-32 w-full object-cover sm:h-full";
  }
}

export function StorefrontPromoZone({
  template,
  tiles,
  categories,
  theme,
  onSelectCategory,
}: {
  template: StoreTemplate;
  tiles: PromoTile[];
  categories: PromoCategory[];
  theme: StorefrontTheme;
  onSelectCategory?: (categoryId: string) => void;
}) {
  const visibleTiles = tiles.filter((tile) => tile.title.trim() || tile.subtitle.trim());
  if (visibleTiles.length === 0) return null;

  const layout = PROMO_LAYOUTS[template.heroStyle];

  return (
    <section
      aria-label="Shop promotions"
      className="mx-auto grid max-w-6xl gap-4 px-4 py-8 sm:grid-cols-2"
      data-promo-layout={layout}
      data-template={template.id}
    >
      {visibleTiles.map((tile, index) => {
        const category = categories.find((item) => item.name === tile.categoryName);
        const campaign = layout === "campaign" && Boolean(tile.imageUrl);
        const imageOnRight = layout === "gallery" && index % 2 === 1;
        const content = (
          <div
            className={cn(
              "relative min-w-0 p-4",
              layout === "spotlight" && "flex flex-col items-center",
              layout === "campaign" && "flex min-h-52 flex-col justify-end bg-black/45 sm:p-6",
              layout === "strip" && "flex-1 py-3 pr-4",
              layout === "list" && "flex-1 py-3",
            )}
          >
            <h2
              className="text-lg font-semibold"
              style={{ color: campaign ? theme.buttonText : theme.primary }}
            >
              {tile.title}
            </h2>
            {tile.subtitle ? <p className="mt-1 text-sm opacity-80">{tile.subtitle}</p> : null}
            {category && onSelectCategory ? (
              <button
                type="button"
                className="mt-3 rounded-md px-3 py-2 text-sm font-medium transition-transform hover:scale-[1.02] motion-reduce:transition-none"
                style={{ backgroundColor: theme.accent, color: theme.buttonText }}
                onClick={() => onSelectCategory(category.id)}
              >
                Explore {category.name}
              </button>
            ) : category ? (
              <span
                className="mt-3 inline-flex rounded-md px-3 py-2 text-sm font-medium"
                style={{ backgroundColor: theme.accent, color: theme.buttonText }}
              >
                Explore {category.name}
              </span>
            ) : null}
          </div>
        );
        const image = tile.imageUrl ? (
          <img
            src={tile.imageUrl}
            alt=""
            loading="lazy"
            className={cn(promoImageClasses(layout), imageOnRight && "md:order-2")}
          />
        ) : null;

        return (
          <article
            key={tile.id}
            className={cn(
              "relative min-w-0 overflow-hidden",
              promoLayoutClasses(layout),
              "transition-all duration-200 hover:shadow-lg motion-reduce:transition-none",
              (layout === "campaign" || layout === "list") && "sm:col-span-2",
              layout !== "campaign" && "rounded-xl border",
              layout === "list" && "rounded-none border-b",
            )}
            style={{
              backgroundColor: theme.surface,
              borderColor: `${theme.accent}40`,
              fontFamily: `"${template.fontFamily}", Inter, sans-serif`,
            }}
          >
            {campaign && image ? (
              <>
                {image}
                <div className="absolute inset-0 bg-black/35" />
                {content}
              </>
            ) : (
              <>
                {image}
                {content}
              </>
            )}
          </article>
        );
      })}
    </section>
  );
}
