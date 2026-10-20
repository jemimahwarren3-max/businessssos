export const TEMPLATE_IDS = [
  "modern-minimal",
  "fashion-boutique",
  "beauty",
  "grocery",
  "food",
  "luxury",
  "home",
  "wholesale",
  "social",
  "digital",
] as const;

export type TemplateId = (typeof TEMPLATE_IDS)[number];

export type StoreLayout =
  | "grid"
  | "editorial"
  | "soft"
  | "dense"
  | "menu"
  | "luxury"
  | "showcase"
  | "wholesale"
  | "social"
  | "services";

export type StoreTemplate = {
  id: TemplateId;
  name: string;
  description: string;
  bestFor: string;
  layout: StoreLayout;
  fontFamily: string;
  fontHref: string;
  defaultAccent: string;
  imageRatio: "square" | "portrait" | "landscape";
  density: "compact" | "comfortable" | "spacious";
  /** Shown only inside the merchant gallery. Not real products. */
  sampleLabel: string;
};

export const STORE_TEMPLATES: readonly StoreTemplate[] = [
  {
    id: "modern-minimal",
    name: "Modern minimal",
    description: "Spacious grid, clear prices, and fast search for everyday products.",
    bestFor: "General retail, electronics, homeware",
    layout: "grid",
    fontFamily: "Inter",
    fontHref: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
    defaultAccent: "#1F2937",
    imageRatio: "square",
    density: "comfortable",
    sampleLabel: "Sample layout, not your products",
  },
  {
    id: "fashion-boutique",
    name: "Fashion & boutique",
    description: "Editorial hero and large portraits for clothing, shoes, and accessories.",
    bestFor: "Clothing, shoes, bags, jewellery",
    layout: "editorial",
    fontFamily: "Fraunces",
    fontHref:
      "https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&family=Fraunces:opsz,wght@9..144,500;9..144,600&display=swap",
    defaultAccent: "#3F2E2A",
    imageRatio: "portrait",
    density: "spacious",
    sampleLabel: "Sample layout, not your products",
  },
  {
    id: "beauty",
    name: "Beauty & cosmetics",
    description: "Category-led collections with room for ingredients and shade notes you supply.",
    bestFor: "Cosmetics, skincare, hair products",
    layout: "soft",
    fontFamily: "Nunito",
    fontHref: "https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700&display=swap",
    defaultAccent: "#9D4E6C",
    imageRatio: "square",
    density: "comfortable",
    sampleLabel: "Sample layout, not your products",
  },
  {
    id: "grocery",
    name: "Grocery & convenience",
    description: "Dense cards, quantity steppers, and category browsing for repeat shops.",
    bestFor: "Grocery shops and mini-markets",
    layout: "dense",
    fontFamily: "Source Sans 3",
    fontHref:
      "https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&display=swap",
    defaultAccent: "#166534",
    imageRatio: "square",
    density: "compact",
    sampleLabel: "Sample layout, not your products",
  },
  {
    id: "food",
    name: "Food & restaurant",
    description: "Menu sections, item notes, hours, and pickup or delivery.",
    bestFor: "Restaurants, takeaways, bakeries",
    layout: "menu",
    fontFamily: "Literata",
    fontHref:
      "https://fonts.googleapis.com/css2?family=Literata:opsz,wght@7..72,500;7..72,650&display=swap",
    defaultAccent: "#9A3412",
    imageRatio: "landscape",
    density: "comfortable",
    sampleLabel: "Sample layout, not your products",
  },
  {
    id: "luxury",
    name: "Premium luxury",
    description: "Quiet typography, wide margins, and a single refined product story.",
    bestFor: "Premium fashion, jewellery, gifts",
    layout: "luxury",
    fontFamily: "Cormorant Garamond",
    fontHref:
      "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Outfit:wght@400;500&display=swap",
    defaultAccent: "#1C1917",
    imageRatio: "portrait",
    density: "spacious",
    sampleLabel: "Sample layout, not your products",
  },
  {
    id: "home",
    name: "Home & lifestyle",
    description: "Large photography with space for dimensions, materials, and delivery notes.",
    bestFor: "Furniture, decor, appliances",
    layout: "showcase",
    fontFamily: "Manrope",
    fontHref: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700&display=swap",
    defaultAccent: "#3F4F44",
    imageRatio: "landscape",
    density: "spacious",
    sampleLabel: "Sample layout, not your products",
  },
  {
    id: "wholesale",
    name: "Wholesale & bulk",
    description: "Quantity-first rows, minimums, and quote requests when a cart is not enough.",
    bestFor: "Distributors and wholesalers",
    layout: "wholesale",
    fontFamily: "IBM Plex Sans",
    fontHref:
      "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&display=swap",
    defaultAccent: "#1E3A5F",
    imageRatio: "square",
    density: "compact",
    sampleLabel: "Sample layout, not your products",
  },
  {
    id: "social",
    name: "Social commerce",
    description: "Mobile-first photos, WhatsApp contact, and a short checkout.",
    bestFor: "WhatsApp, Instagram, and home sellers",
    layout: "social",
    fontFamily: "Plus Jakarta Sans",
    fontHref:
      "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap",
    defaultAccent: "#BE185D",
    imageRatio: "portrait",
    density: "comfortable",
    sampleLabel: "Sample layout, not your products",
  },
  {
    id: "digital",
    name: "Digital products & services",
    description:
      "Service descriptions and a request flow. Nothing is marked delivered until you fulfil it.",
    bestFor: "Downloads, classes, consultations",
    layout: "services",
    fontFamily: "Figtree",
    fontHref: "https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;700&display=swap",
    defaultAccent: "#4338CA",
    imageRatio: "landscape",
    density: "comfortable",
    sampleLabel: "Sample layout, not your products",
  },
];

export function isTemplateId(value: string): value is TemplateId {
  return (TEMPLATE_IDS as readonly string[]).includes(value);
}

export function getTemplate(id: string): StoreTemplate {
  return STORE_TEMPLATES.find((template) => template.id === id) ?? STORE_TEMPLATES[0]!;
}
