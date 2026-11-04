export type OnlineProductReadinessInput = {
  price: number;
  imageUrl: string | null;
  galleryUrls?: string[] | null;
  details?: string | null;
};

export function getOnlineProductReadiness(product: OnlineProductReadinessInput) {
  const missing: string[] = [];
  const gallery = Array.isArray(product.galleryUrls) ? product.galleryUrls : [];
  const details = typeof product.details === "string" ? product.details : "";
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
