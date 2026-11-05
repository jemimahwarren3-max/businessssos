import type { StoreCategoryId } from "@/lib/storefront/templates";

/** Static marketing photos shipped in /public, safe placeholders until merchants upload their own. */
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

const SAMPLE_PRODUCTS: Record<StoreCategoryId, readonly { name: string; price: number }[]> = {
  beauty: [
    { name: "Morning serum", price: 18 },
    { name: "Clay cleanser", price: 12 },
    { name: "Rose mist", price: 9 },
    { name: "Night balm", price: 16 },
    { name: "Daily face oil", price: 22 },
    { name: "Gentle body wash", price: 14 },
    { name: "Calm hand cream", price: 11 },
    { name: "Sun balm", price: 10 },
  ],
  fashion: [
    { name: "Linen shirt", price: 42 },
    { name: "Wrap dress", price: 58 },
    { name: "Canvas tote", price: 24 },
    { name: "Soft scarf", price: 19 },
    { name: "Cotton trousers", price: 52 },
    { name: "Leather belt", price: 31 },
    { name: "Weekend jacket", price: 86 },
    { name: "Everyday tee", price: 28 },
  ],
  electronics: [
    { name: "Phone case", price: 15 },
    { name: "Fast charger", price: 22 },
    { name: "Earbuds", price: 35 },
    { name: "USB-C cable", price: 8 },
    { name: "Power bank", price: 30 },
    { name: "Smart speaker", price: 49 },
    { name: "Wireless mouse", price: 18 },
    { name: "Travel adapter", price: 12 },
  ],
  home: [
    { name: "Ceramic vase", price: 28 },
    { name: "Table lamp", price: 45 },
    { name: "Cotton throw", price: 32 },
    { name: "Serving bowl", price: 18 },
    { name: "Linen cushions", price: 22 },
    { name: "Wooden tray", price: 26 },
    { name: "Glass carafe", price: 19 },
    { name: "Woven basket", price: 34 },
  ],
  food: [
    { name: "Sourdough loaf", price: 4 },
    { name: "Butter croissant", price: 2.5 },
    { name: "House coffee", price: 3 },
    { name: "Wild honey", price: 7 },
    { name: "Seeded rye", price: 5 },
    { name: "Almond tart", price: 4 },
    { name: "Seasonal jam", price: 6 },
    { name: "Granola pack", price: 5 },
  ],
  jewellery: [
    { name: "Gold studs", price: 64 },
    { name: "Chain necklace", price: 88 },
    { name: "Signet ring", price: 72 },
    { name: "Gift bracelet", price: 54 },
    { name: "Pearl studs", price: 70 },
    { name: "Silver hoops", price: 48 },
    { name: "Stacking band", price: 63 },
    { name: "Pendant charm", price: 59 },
  ],
  wellness: [
    { name: "Body oil", price: 21 },
    { name: "Travel mat", price: 36 },
    { name: "Herbal tea", price: 11 },
    { name: "Rest balm", price: 14 },
    { name: "Stretch bands", price: 18 },
    { name: "Sleep tea", price: 13 },
    { name: "Massage oil", price: 24 },
    { name: "Linen eye pillow", price: 20 },
  ],
  books: [
    { name: "Lined notebook", price: 8 },
    { name: "New novel", price: 16 },
    { name: "Gift wrap set", price: 6 },
    { name: "Desk pencils", price: 5 },
    { name: "Paper planner", price: 14 },
    { name: "Story collection", price: 18 },
    { name: "Colored pencils", price: 7 },
    { name: "Gift card", price: 10 },
  ],
  sports: [
    { name: "Training bottle", price: 12 },
    { name: "Grip bands", price: 9 },
    { name: "Club cap", price: 18 },
    { name: "Gym towel", price: 11 },
    { name: "Yoga block", price: 16 },
    { name: "Running socks", price: 14 },
    { name: "Training gloves", price: 22 },
    { name: "Resistance loop", price: 8 },
  ],
  general: [
    { name: "Market basket", price: 14 },
    { name: "Bar soap", price: 4 },
    { name: "Storage tin", price: 9 },
    { name: "Kitchen cloth", price: 6 },
    { name: "Enamel mug", price: 11 },
    { name: "Wool socks", price: 13 },
    { name: "Glass jar", price: 8 },
    { name: "Wooden scoop", price: 5 },
  ],
};

/** Demo catalogue shown only in template pickers, not real inventory. */
export function sampleProductsForCategory(category: StoreCategoryId) {
  return SAMPLE_PRODUCTS[category] ?? SAMPLE_PRODUCTS.general;
}
