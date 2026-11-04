export type OnlineProductReadinessInput = {
  price: number;
  imageUrl: string | null;
  galleryUrls?: string[] | null;
  details?: string | null;
};

export function getOnlineProductReadiness(product: OnlineProductReadinessInput) {
  const missing: string[] = [];
  const gallery = product.galleryUrls ?? [];
  const details = product.details ?? "";
  if (!Number.isFinite(product.price) || product.price <= 0) {
    missing.push("Missing selling price");
  }
  if (!product.imageUrl && gallery.length === 0) {
    missing.push("Missing product image");
  }
  if (!details.trim()) {
    missing.push("Missing description");
  }
  return { ready: missing.length === 0, missing };
}
