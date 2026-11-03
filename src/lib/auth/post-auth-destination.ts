export type PostAuthAppPath = "/onboarding" | "/setup" | "/dashboard" | "/admin";

/**
 * Where a signed-in user should land. Membership and setup status come
 * from Postgres (via loadWorkspace / business_members), not from the client.
 *
 * - Shop with setup complete → dashboard.
 * - Shop still in setup (`setup_completed_at` empty) → /setup, not the
 *   create-shop wizard. `onboarding_completed` is not used here.
 * - No shop, platform administrator → /admin (route still 404s non-admins).
 * - No shop otherwise → /onboarding (create a store).
 * - Membership unknown (workspace query failed) → /dashboard so an existing
 *   shop is not dumped onto create-shop; the dashboard shows retry.
 */
export function destinationAfterAuth(input: {
  hasMembership: boolean | null;
  setupCompleted: boolean | null;
  isPlatformAdmin: boolean;
}): PostAuthAppPath {
  if (input.hasMembership === true) {
    return input.setupCompleted === true ? "/dashboard" : "/setup";
  }
  if (input.hasMembership === false) {
    if (input.isPlatformAdmin) return "/admin";
    return "/onboarding";
  }
  return "/dashboard";
}

/** Google `next=` is a start-URL hint only. The DB-derived destination wins. */
export function applyOAuthNext(
  next: string | undefined,
  destination: PostAuthAppPath,
): PostAuthAppPath {
  if (next === destination) return destination;
  return destination;
}

/**
 * Create-shop (`/onboarding`) is only for people with no membership.
 * A failed or in-flight workspace load is not "no shop".
 */
export function shouldSendToCreateShop(input: {
  isLoading: boolean;
  isError: boolean;
  workspace: unknown | null | undefined;
}): boolean {
  if (input.isLoading || input.isError) return false;
  return input.workspace == null;
}

/**
 * Where `/onboarding` should send an already-loaded workspace.
 * `null` means stay and show the create-shop wizard (no shop yet).
 */
export function onboardingPageDestination(input: {
  hasMembership: boolean;
  setupCompleted: boolean | null;
}): "/setup" | "/dashboard" | null {
  if (!input.hasMembership) return null;
  return input.setupCompleted === true ? "/dashboard" : "/setup";
}
