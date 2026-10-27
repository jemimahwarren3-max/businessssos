import type { Marketplace } from "@/lib/storefront/contract";

export type PublishedShop = Marketplace["shops"][number];

export const FEATURED_PUBLISHED_LIMIT = 6;

export function featuredPublishedShops(shops: PublishedShop[]): PublishedShop[] {
  return shops.slice(0, FEATURED_PUBLISHED_LIMIT);
}
