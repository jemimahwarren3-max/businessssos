# Threat model (STRIDE)

**System:** Kwetuu — multi-tenant merchant OS, public storefronts, marketplace browse, platform billing.  
**Trust boundaries:** Browser → Cloud Run (Node/TanStack Start) → Supabase (Auth, Postgres, Storage) → Paynow, Resend, Groq, optional Upstash/Sentry.

## Assets

- Merchant financial records (sales, invoices, POS, store orders)
- Customer PII (orders, optional accounts)
- Session cookies and Supabase refresh tokens (server-sealed)
- `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `PAYNOW_*`, `SHOP_PAYMENT_ENCRYPTION_KEY`, `MAIL_FLUSH_SECRET`, `GROQ_API_KEY`
- Platform owner roles/entitlements (DB-backed, service_role managed)
- Payment proofs (private bucket)

## STRIDE summary

| Category | Example | Primary controls |
|----------|---------|------------------|
| **Spoofing** | Fake Paynow webhook | Hash verify + poll; rate limits |
| **Tampering** | Client sets order total | `create_store_order` prices in SQL |
| **Repudiation** | Seller denies marking paid | `store_order_events`, audit_logs, seller confirm records |
| **Information disclosure** | Cross-tenant SELECT | RLS + membership RPCs |
| **Denial of service** | Checkout spam | `check_rate_limit` (Postgres) |
| **Elevation** | Call `paynow_confirm_payment` as user | REVOKE; service_role only |

## Actors

Malicious shopper, malicious seller, fraudulent staff, compromised admin, anonymous API caller (anon key), Paynow (semi-trusted), insider operator.

## High-priority scenarios

1. **Cross-seller order/product access** — Mitigated by RLS and security definer checks; must regression-test on staging.
2. **Payment forgery** — Mitigated by no client-side paid flag; proof ≠ paid; Paynow poll constraints.
3. **Platform privilege escalation** — `platform_roles` / `platform_entitlements` not writable by authenticated; bootstrap one-time.
4. **Session theft** — httpOnly, Secure, SameSite Lax, CSRF on server functions.
5. **AI prompt injection** — Assistant read-only; writes still pass permission checks; scope retrieval to business (see `SECURITY_ARCHITECTURE.md`).

## Out of scope (not built)

Marketplace settlement, cardholder data storage, native mobile offline sync (design only), WhatsApp webhooks live.

See also: `../THREAT_MODEL.md` (legacy short form), `SECURITY_ARCHITECTURE.md`.
