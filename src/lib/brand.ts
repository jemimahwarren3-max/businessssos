export const BRAND = {
  name: "Kwetuu",
  domain: "mykwetuu.com",
  appUrl: "https://mykwetuu.com",
  /** House mark and PWA theme — matches public/kwetuu-logo.png */
  themeColor: "#AF513D",
  markOn: "#FFFFFF",
} as const;

/** Document title suffix for app and legal pages. */
export function pageTitle(page: string): string {
  return `${page} | ${BRAND.name}`;
}

export const HOME_SEO = {
  title: "Kwetuu | Discover independent shops, or open your own",
  description:
    "Shop independent businesses across Zimbabwe, explore unique products, or create your own online store with a website that feels like your brand.",
  ogDescription:
    "A Zimbabwe-first marketplace and the easiest way for a small business to launch its own online store.",
} as const;
