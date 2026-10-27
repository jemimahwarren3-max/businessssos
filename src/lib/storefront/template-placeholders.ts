import type { StoreCategoryId } from "@/lib/storefront/templates";

/** Static marketing photos shipped in /public — safe placeholders until merchants upload their own. */
const CATEGORY_HERO: Record<StoreCategoryId, string> = {
  beauty: "/marketing/beauty.jpg",
  fashion: "/marketing/fashion.jpg",
  electronics: "/marketing/home.jpg",
  home: "/marketing/home.jpg",
  food: "/marketing/bakery.jpg",
  jewellery: "/marketing/fashion.jpg",
  wellness: "/marketing/beauty.jpg",
  books: "/marketing/home.jpg",
  sports: "/marketing/hero-seller.jpg",
  general: "/marketing/hero-seller.jpg",
};

export function categoryPlaceholderImage(category: StoreCategoryId): string {
  return CATEGORY_HERO[category] ?? "/marketing/hero-seller.jpg";
}

/** Generic product tile for onboarding and empty catalogue previews. */
export function productPlaceholderImage(category: StoreCategoryId): string {
  return categoryPlaceholderImage(category);
}
