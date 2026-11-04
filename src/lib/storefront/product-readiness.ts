export type OnlineProductReadinessInput = {
  price?: number | null;
  imageUrl?: string | null;
  galleryUrls?: string[] | null;
  details?: string | null;
};

export function getOnlineProductReadiness(product: OnlineProductReadinessInput) {
  const missing: string[] = [];
  const normalizedPrice = Number(product.price);
  const normalizedDetails = typeof product.details === "string" ? product.details : "";
  const galleryUrls = Array.isArray(product.galleryUrls) ? product.galleryUrls : [];

  if (!Number.isFinite(normalizedPrice) || normalizedPrice <= 0) {
    missing.push("Missing selling price");
  }
  if (!product.imageUrl && galleryUrls.length === 0) {
    missing.push("Missing product image");
  }
  if (!normalizedDetails.trim()) {
    missing.push("Missing description");
  }
  return { ready: missing.length === 0, missing };
}
