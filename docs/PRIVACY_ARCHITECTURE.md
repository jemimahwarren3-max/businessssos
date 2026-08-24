# Privacy Architecture — BusinessOS AI

Internal, technical companion to `legal/PRIVACY_POLICY.md` — this document
names actual tables, columns, and mechanisms; the Privacy Policy is the
plain-language version for end users. Written for whoever needs to answer
"where exactly does X live and how is it deleted" — a future engineer, a
lawyer, or a data-subject-request handler.

## Data inventory

| Data category | Where it lives | Personal data? | Collected at | Deletable via |
|---|---|---|---|---|
| Auth credentials (email, hashed password) | Supabase-managed `auth.users` | Yes | Sign-up | Account deletion (Flow 4, `docs/DATA_FLOW.md`) |
| Full name | `auth.users` user metadata (`full_name`) | Yes | Sign-up | Account deletion |
| Business profile (name, type, currency, phone, address) | `public.businesses` | Partial (phone/address if provided) | Business creation / onboarding | Account deletion (cascade) |
| Team membership + role | `public.business_members` | Yes (links a person to a business) | Business creation / (future) invite | Account deletion (cascade for owned businesses; `ON DELETE CASCADE` from `auth.users` for the user's own membership rows) |
| Customer records (name, phone, email, address, notes) | `public.customers` | Yes — this is personal data *about the business's customers*, entered by the business owner | Manually entered | Deleted individually in-app, or cascade-deleted with the business |
| Products, sales, invoices, quotes, expenses, inventory movements | Respective tables (`products`, `sales`, `sale_items`, `invoices`, `invoice_items`, `quotes`, `quote_items`, `expenses`, `inventory_movements`) | Indirectly (references customer names) | Normal app usage | Account deletion (cascade) |
| Subscription/billing history | `public.subscriptions`, `public.subscription_payments` | Yes (email sent to Paynow, correlated here) | Checkout | Account deletion (cascade) |
| Audit trail of write actions | `public.audit_logs` | Yes (`user_id`, though set to `NULL` on user deletion via `ON DELETE SET NULL`) | Every write action | Not directly deletable by users — survives account deletion with `user_id` nulled, business_id cascade-deleted with the business |
| Legal acceptance record | `public.legal_acceptances` | Yes (`user_id`, IP address) | Sign-up | Cascade-deleted (`ON DELETE CASCADE` from `auth.users`) on account deletion |
| Session | Encrypted httpOnly cookie, client-side only — nothing server-side to delete | Yes (session tokens) | Sign-in | Sign-out, or expiry |
| Cached workspace lookup (optional) | Upstash Redis, if configured | Indirect (business/role/plan, keyed by user ID) | Every workspace load | Short TTL; also explicitly invalidated on relevant writes (`invalidateWorkspaceCacheForBusiness`) |

## Processing purposes

Every category above exists for one of exactly three reasons:

1. **Operating the service** — the large majority of the inventory above.
2. **Payment processing** — subscription/billing tables, and what's sent to
   Paynow.
3. **AI Assistant** — the aggregated summary built and sent to Groq per
   request (never stored — see `docs/DATA_FLOW.md` Flow 3).

Nothing is collected "because it might be useful later" — see the
`ProductInput`/`CustomerInput`/etc. Zod schemas in `src/lib/business.schemas.ts`
for the exact fields the app actually accepts; there's no catch-all
metadata field anywhere in the schema.

## Retention

- **Business data**: retained as long as the account exists. No automatic
  expiry or archival job exists — this is a gap worth deciding on
  deliberately (see `docs/LEGAL_RISK_REGISTER.md` for backup/retention
  items).
- **Audit logs**: retained indefinitely, `user_id` nulled on account
  deletion rather than the row being removed — this is intentional (an
  audit trail that vanishes when the actor deletes their account defeats
  its purpose), but means audit log retention is effectively unbounded
  today. Worth a deliberate retention window decision.
- **Legal acceptances**: cascade-deleted with the account. This is a
  tension worth flagging: if this record is ever needed as evidence *after*
  a user has deleted their account, it won't exist. `LEGAL REVIEW
  REQUIRED`: decide whether this record should instead survive account
  deletion (e.g. by nulling `user_id` like `audit_logs` does, rather than
  cascading) for evidentiary purposes.

## User rights — implementation

| Right | Mechanism | Verified |
|---|---|---|
| Access / export | `src/lib/data-export.server.ts`, Settings → Export data | Live-tested: correct data returned, non-owner/admin roles blocked |
| Deletion | `src/lib/account-deletion.server.ts`, Settings → Account → Delete Account | Live-tested: full cascade confirmed; blocked-with-no-partial-state confirmed when other members exist |
| Correction | Direct in-app editing of individual records | Standard CRUD, not a formal "rights" flow |
| Consent record | `public.legal_acceptances`, written by `src/lib/legal-acceptance.server.ts` | Live-tested: correct version/IP recorded; user-side forgery blocked by RLS |

No formal mechanism exists yet for: objection to processing, or
export in a specific portability-mandated format beyond the JSON already
produced. `LEGAL REVIEW REQUIRED`: whether these are needed depends on
which jurisdictions' users are served.

## AI processing

See `docs/DATA_FLOW.md` Flow 3 for the exact fields sent to Groq. Key
architectural point: `buildBusinessSummary()` (`src/lib/ai.server.ts`) is
the *only* function that assembles data for the AI Assistant, and it never
does a raw table dump — every field included is deliberately selected.
There's no code path where the AI Assistant (or any future AI feature)
could accidentally receive more than this function returns.

## International transfers

`LEGAL REVIEW REQUIRED` in full — this depends on confirming Supabase's,
Paynow's, and Groq's actual processing regions, none of which have been
independently verified as part of this work. See
`docs/THIRD_PARTY_SERVICES.md`.

## Consent mechanism

Terms of Service / Privacy Policy acceptance is captured once, at sign-up,
gated by a required checkbox enforced server-side (not just a disabled
button — `signUpSchema` in `src/lib/auth/auth.functions.ts` rejects the
request entirely if `acceptedTerms` isn't `true`). The same gate applies to
Google OAuth sign-up via a flag carried through the redirect round-trip.
There is currently no separate marketing-consent or analytics-consent
mechanism, because there is no marketing email sending and no analytics
tool to consent to — see `docs/THIRD_PARTY_SERVICES.md`'s "deliberately not
integrated" section. If either is added later, it needs its own,
separate consent capture — not folded into the existing Terms/Privacy
checkbox.
