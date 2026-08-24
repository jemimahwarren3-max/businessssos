// Server-only by design — this gates real enforcement (trial-expiry
// read-only lock, checkout visibility), so it must never be a client-
// exposed VITE_ variable a tampered request could spoof. Read once per
// call rather than cached at module load so a redeploy always picks up the
// current value without stale in-memory state.
//
// Defaults to enabled (today's normal behavior) if unset — an explicit
// "false" is required to enter free-beta mode, not a missing/misconfigured
// env var accidentally suspending billing enforcement.
export function isBillingEnabled(): boolean {
  return process.env["BILLING_ENABLED"] !== "false";
}
