/** How long the onboarding spinner may block before we show an error or continue. */
export const ONBOARDING_LOAD_TIMEOUT_MS = 8_000;

/** Decide whether the shop-setup spinner may keep blocking the page. */
export function onboardingLoadGate(input: {
  workspaceLoading: boolean;
  workspaceError: boolean;
  businessId: string | null;
  adminLoading: boolean;
  hasAdminData: boolean;
  adminError: boolean;
  timedOut: boolean;
}): "spinner" | "workspace-error" | "admin-error" | "ready" {
  if (input.workspaceError || (input.workspaceLoading && input.timedOut)) {
    return "workspace-error";
  }
  if (input.adminError && input.businessId) return "admin-error";
  if (input.workspaceLoading) return "spinner";
  if (input.businessId && input.adminLoading && !input.hasAdminData && !input.timedOut) {
    return "spinner";
  }
  return "ready";
}

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
