export type OnlineProductReadinessInput = {
  price: number;
  imageUrl: string | null;
  galleryUrls: string[];
  details: string;
};

export function getOnlineProductReadiness(product: OnlineProductReadinessInput) {
  const missing: string[] = [];
  if (!Number.isFinite(product.price) || product.price <= 0) {
    missing.push("Missing selling price");
  }
  if (!product.imageUrl && product.galleryUrls.length === 0) {
    missing.push("Missing product image");
  }
  if (!product.details.trim()) {
    missing.push("Missing description");
  }
  return { ready: missing.length === 0, missing };
}
