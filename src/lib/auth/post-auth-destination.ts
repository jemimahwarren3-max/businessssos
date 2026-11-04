export type PostAuthAppPath = "/onboarding" | "/dashboard" | "/admin";

/**
 * Where a signed-in user should land. Membership and onboarding status come
 * from Postgres (via loadWorkspace / business_members), not from the client.
 *
 * - Completed shop → dashboard (owners and staff; first membership if several).
 * - Shop still in setup → onboarding.
 * - No shop, platform administrator → /admin (route still 404s non-admins).
 * - No shop otherwise → onboarding (create a store). Shopper accounts live on
 *   each storefront (`/store/$slug/account`), not a global customer dashboard.
 */
export function destinationAfterAuth(input: {
  onboardingCompleted: boolean | null;
  isPlatformAdmin: boolean;
}): PostAuthAppPath {
  if (input.onboardingCompleted === true) return "/dashboard";
  if (input.onboardingCompleted === false) return "/onboarding";
  if (input.isPlatformAdmin) return "/admin";
  return "/onboarding";
}
