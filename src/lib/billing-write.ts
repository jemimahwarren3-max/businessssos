import { isBillingEnabled } from "@/lib/feature-flags.server";

/** True if a subscription in this state is allowed to write — active, or
 * still inside an unexpired trial. Shared by assertCanWrite (server-side
 * enforcement) and loadWorkspace (so the UI can show a read-only banner).
 * Always true while BILLING_ENABLED=false (free beta) — the underlying
 * subscription/trial data keeps accumulating normally either way (see
 * create_business_with_owner), so re-enabling billing later doesn't need a
 * data migration, only flipping the flag back.
 *
 * Missing subscription rows fail closed when billing is on. A shop without
 * a row must not keep writing as if it were on a trial. */
export function canWriteForSubscription(
  subscription: { status: string; trial_ends_at: string | null } | null,
) {
  if (!isBillingEnabled()) return true;
  if (!subscription) return false;
  if (subscription.status === "active") return true;
  return Boolean(
    subscription.status === "trialing" &&
    subscription.trial_ends_at &&
    new Date(subscription.trial_ends_at) > new Date(),
  );
}

export function canWriteWithPlatformEntitlement(
  subscription: { status: string; trial_ends_at: string | null } | null,
  hasOwnerBypass: boolean,
) {
  return hasOwnerBypass || canWriteForSubscription(subscription);
}
