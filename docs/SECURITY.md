# Kwetuu security baseline

This is a repository security summary, not a penetration-test report or legal
certification. The **security programme** lives under
[`docs/security/`](./security/SECURITY_STATUS.md) (`SECURITY_STATUS.md` is the
living checklist). See also [the threat model](./THREAT_MODEL.md),
[security review](./SECURITY_REVIEW.md), and
[privacy architecture](./PRIVACY_ARCHITECTURE.md).

## Existing controls

- Supabase Auth, server-sealed HTTP-only sessions, business membership and
  permission checks.
- Postgres RLS and server-side RPCs for tenant-scoped reads and mutations.
- Server-only service-role key; private payment-proof storage with signed,
  short-lived reads.
- Rate limits for selected sensitive operations and audit records for
  privileged business actions.
- Payment and subscription flows use distinct records and credentials.

These controls must still be validated against the deployed schema and
environment; code inspection alone does not prove production configuration.

## Payment changes in this branch

- Seller Paynow global control defaults disabled and requires an approval
  reference before live approval.
- Seller payment credentials use a dedicated server-only AES-256-GCM key and
  versioned ciphertext; previous and legacy keys support migration/rotation.
- The payment migration extends the audit-action allowlist so the seller
  confirmation audit insert remains valid under the existing database check.
- Poll URLs are constrained to HTTPS Paynow status endpoint host/path, with
  redirects disabled, timeout and response-size bounds.
- Callback signature and polled response signature/reference/amount are
  checked. Order/currency/state checks occur before automatic confirmation.
- Seller manual confirmation is recorded with actor, amount, currency and time;
  it is explicitly distinguished from provider verification.
- The migration changes have not been applied or tested against staging data.

## Secret handling

`SHOP_PAYMENT_ENCRYPTION_KEY` is a server-only 32-byte base64url key, separate
from `SESSION_SECRET`. The deploy workflow passes it from GitHub Actions to the
Cloud Run server environment. Never commit its value, expose it with a `VITE_`
prefix, or log provider credentials. Retain the previous key during lazy key
rotation until all stored credentials are re-encrypted.

## Remaining security work

- Apply and verify the new migration on staging, including RLS/grants and
  repeated migration execution.
- Run staging tenant-isolation/payment integration tests and investigate any
  skipped cases before release.
- Review dependency advisories and test a TanStack upgrade separately.
- Verify backup restoration, secret rotation and operational incident
  procedures.
- Do not enable seller Paynow without written provider/platform permission and
  applicable legal/regulatory review.
