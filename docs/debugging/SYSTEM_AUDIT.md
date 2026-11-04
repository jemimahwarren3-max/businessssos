# Kwetuu System Audit — Stage 1 Discovery

**Date:** 2026-11-03
**Branch:** onboarding-journey (based on origin/master @ 3af0077)
**Scope:** Full application — backend, frontend, business logic, security

---

## Overall Application Status

**The application is in good shape.** Core business workflows (sales, inventory, orders, invoicing, billing, CRM) are well-engineered with atomic database operations, idempotency, row locking, and proper auth/permission gating. No critical security vulnerabilities, data leakage, or financial corruption paths were found.

The codebase is large (308 source files, 65+ migrations, 83 routes, ~143 server functions) and was built with consistent patterns throughout.

---

## Architecture Overview

| Layer | Technology | Status |
|-------|-----------|--------|
| Frontend | React 19 + TanStack Start/Router + Vite 8 | Sound |
| UI | Tailwind CSS v4 + Radix UI/shadcn | Sound |
| Backend | TanStack Start server functions (Nitro) | Sound |
| Database | Supabase (PostgreSQL) | Sound |
| Auth | Supabase Auth (PKCE) + AES-encrypted httpOnly session cookies | Sound |
| Payments | Paynow SDK (EcoCash, InnBucks, bank) | Sound |
| Cache | Upstash Redis | Sound |
| Email | Resend API (outbox pattern) | Partially configured |
| Deploy | Google Cloud Run (auto-deploy from master) | Sound |
| Mobile | Capacitor (Android wrapper) | Exists, untested |

---

## Module-by-Module Audit

### A. Public Landing Page — WORKING
- Landing page fetches live published shops for social proof (never mock data)
- Pricing page shows $7/month with live ZiG conversion
- All CTAs link to `/auth`. No broken links or placeholder content
- `/stores` and `/market` both functional with real data
- Sitemap generated dynamically

### B. Authentication — WORKING
- PKCE flow with in-memory token storage (never localStorage)
- AES-encrypted httpOnly session cookie (SESSION_SECRET >= 32 chars)
- Google OAuth supported
- Email sign-up with verification
- Staff two-stage login (business name + password)
- MFA (TOTP) with AAL2 enforcement
- Account lockout after failed login attempts
- SSR disabled on authenticated routes (documented workaround for OAuth redirect loops)

### C. User Profiles & Business Membership — WORKING
- `is_business_member()` helper used consistently in RLS policies
- `has_business_role()` for role-based gating
- Granular permissions system (57+ permission keys)
- Staff invitations with token-based acceptance
- Impersonation for platform admins (read-only by default)

### D. Business Onboarding — WORKING (recently rewritten)
- 6-step guided journey: name/contact → type/channel → path choice → operations → (conditional) store setup → review & create
- 14-day free trial (extended from 3 days)
- Business path selection (management-only vs full)
- JSONB onboarding config for progress persistence
- Post-creation setup workspace at `/setup`

### E. Products & Catalogue — WORKING
- Full CRUD with images (Supabase Storage)
- Categories, variants, stock quantities
- POS and online visibility controls
- Product import via CSV/Excel
- Barcode scanning support

### F. Inventory Management — WORKING
- Atomic stock adjustments via `adjust_stock` RPC with `SELECT ... FOR UPDATE`
- Movement tracking in `inventory_movements`
- Multi-location stock with `product_stock` table
- Negative stock protection (configurable per business)
- Low stock threshold alerts

### G. Point of Sale — WORKING
- Atomic sale creation via `create_sale` RPC
- Idempotency via unique partial index on `(business_id, idempotency_key)`
- Stock deduction within the same transaction
- Offline queuing via IndexedDB with sequential replay
- Cash drawer/shift management
- Commission tracking
- Receipt generation

### H. Online Storefronts — WORKING
- Full store builder with template selection and branding
- Product listing management
- Published store routes with SEO meta
- Customer-facing cart, checkout, order tracking
- Store reviews and complaint handling
- Custom domain redirect support
- Launch readiness checks

### I. Orders & Checkout — WORKING
- Server-side price validation (client prices ignored)
- Idempotent order creation with advisory locks
- Rate limiting (20 orders/min per store)
- Delivery zone fee calculation server-side
- Optional stock reservation
- Cart quoting before checkout

### J. Payments & Subscriptions — WORKING
- Paynow integration with SHA512 hash verification
- Server-side payment verification (never trusts redirect URL)
- Amount + reference matching before crediting
- Webhook endpoint with hash + re-poll defence-in-depth
- `BILLING_ENABLED` flag for free beta periods
- Separate flows for: subscription payments, shop order payments, launch fees

### K. Customers & CRM — WORKING
- Business-isolated via RLS
- Soft deletes
- Search by name/phone/email
- Transaction history per customer
- Permission-gated CRUD

### L. Expenses & Reporting — WORKING
- Server-side report calculations (not client-side)
- Date-windowed queries
- 20,000 row safety cap on sale_items
- Revenue, expenses, profit, payment breakdowns
- No cross-currency aggregation (correct)

### M. Staff, Branches & Permissions — WORKING
- 57+ granular permission keys
- Role-based assignment (owner/admin/manager/cashier)
- Branch/location management
- Time clock tracking
- Per-role permission matrix editable by owner

### N. Notifications — PARTIALLY WORKING
- In-app notifications: fully functional
- Email: code complete (Resend outbox pattern), depends on deployment config
- WhatsApp: link builder only (wa.me with pre-filled text), not automated — this is intentional and correct
- Order email templates exist and are rendered server-side

---

## Security Findings

| Area | Status |
|------|--------|
| Secret exposure | None — service role key strictly in `.server.ts` files |
| RLS coverage | All tables have RLS enabled with business-scoped policies |
| SECURITY DEFINER functions | 100+ functions, all with auth.uid() checks and `SET search_path = public` |
| Input validation | All server functions use `parseAndSanitize(zodSchema)` with HTML stripping |
| Rate limiting | Postgres-backed, fail-closed, covers auth + write operations + webhooks |
| Payment verification | SHA512 hash + server-side re-poll + amount/reference matching |
| Session security | AES-encrypted httpOnly cookies, PKCE flow, in-memory tokens |
| Tenant isolation | Consistent business_id scoping in queries and RLS policies |
| Admin access | Server-side `checkPlatformAdmin()` + client `AdminGate` |
| Environment variables | Clean client/server separation, ESLint guard on admin client imports |

**No critical (P0) security issues found.**

---

## Database Findings

- ~45 tables, well-organized by domain
- Foundation migration includes dynamic RLS enablement loop for all tables
- Foreign keys and indexes present throughout
- Performance indexes added in dedicated migration (`perf_indexes_and_timeout`)
- `auth.role()` used 16 times in SECURITY DEFINER functions — all in the safe `<> 'service_role'` pattern (deprecated API, not a bug)

---

## Performance Findings

- Redis caching for workspace data (60s TTL)
- Skeleton loading states on all authenticated routes (155 occurrences)
- Store pages have `s-maxage=60, stale-while-revalidate=300` cache headers
- Report queries capped at 20,000 rows
- Data export capped at 100,000 rows per table
- No obvious N+1 query patterns detected

---

## Deployment Findings

- Google Cloud Run auto-deploys from master
- Health check endpoint at `/health`
- Staging and production Supabase projects exist
- Migration scripts and staging apply tools in `scripts/`
- Sentry error tracking configured

---

## Root Causes

No systemic root causes identified. The codebase was built with consistent patterns (authAndRateLimit middleware, parseAndSanitize validation, atomic RPCs, idempotency keys) applied uniformly.

---

## Prioritised Issues

See ISSUE_REGISTER.md for the complete list.
