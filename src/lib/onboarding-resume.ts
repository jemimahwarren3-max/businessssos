/** Pick the shop-setup step so a returning merchant does not start over. */
export function resumeOnboardingShopStep(input: {
  slug?: string | null;
  status?: string | null;
  productCount: number;
}): number {
  if (!input.slug) return 0;
  if (input.status === "published" || input.productCount > 0) return 3;
  return 1;
}
