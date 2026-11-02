/** Pick the shop-setup step so a returning merchant does not start over. */
export function resumeOnboardingShopStep(input: {
  slug?: string | null;
  status?: string | null;
  productCount: number;
  savedStep?: number | null;
}): number {
  if (
    typeof input.savedStep === "number" &&
    Number.isInteger(input.savedStep) &&
    input.savedStep >= 0 &&
    input.savedStep <= 3
  ) {
    return input.savedStep;
  }
  if (!input.slug) return 0;
  if (input.status === "published" || input.productCount > 0) return 3;
  return 1;
}

export function onboardingShopStepStorageKey(businessId: string): string {
  return `kwetuu:onboarding-shop-step:${businessId}`;
}

export function readOnboardingShopStep(
  storage: Pick<Storage, "getItem">,
  businessId: string,
): number | null {
  const raw = storage.getItem(onboardingShopStepStorageKey(businessId));
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 3) return null;
  return value;
}
