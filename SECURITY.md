# Security — BusinessOS AI

This documents the security architecture as it actually exists in the
codebase today, verified by reading the code and, where noted, by live
testing — not aspirational. Gaps are called out explicitly rather than
implied away. See `legal/LEGAL_REVIEW_REQUIRED.md` for anything here that
also needs a lawyer's input.

## Reporting a vulnerability

`LEGAL REVIEW REQUIRED` / open item: there is no disclosed security contact
or responsible-disclosure process yet. Add one (a monitored email address is
enough to start) before this document is published anywhere external.

## Authentication

- Handled by Supabase Auth. Passwords are hashed by Supabase, never touched
  or logged by application code.
- Sessions are stored in an httpOnly, encrypted cookie sealed by TanStack
  Start's built-in session primitive (AES + HMAC, the same mechanism as
  `iron-session`) — not in browser localStorage, and not a bearer token the
  client attaches manually.
- Google sign-in uses the OAuth PKCE flow. The code exchange happens
  server-side in `src/routes/auth.callback.tsx`; the client never handles a
  raw access token from the OAuth provider.
- Session refresh (`src/lib/auth/session.server.ts`) fails closed: a failed
  refresh clears the session and requires re-authentication rather than
  treating a stale session as valid.
- Sign-in, sign-up, and password-reset endpoints are rate-limited by IP
  (10/min, 5/min, 5/min respectively — see Rate limiting below) specifically
  against credential-stuffing and enumeration attempts. Sign-in and sign-up
  error messages are deliberately generic (e.g. "Incorrect email or
  password" regardless of which is wrong) so they don't confirm which
  emails have accounts.
- Minimum password length is enforced **twice**, deliberately: 8 characters
  in the app's own Zod schema (`src/lib/auth/auth.functions.ts`), and
  separately at the Supabase Auth level itself (`password_min_length: 8`,
  set via the Management API on both environments). The second one matters
  because the Supabase anon/publishable key is exposed to the browser by
  design — anything relying solely on the app's own validation could be
  bypassed by calling `supabase.auth.signUp()` directly. Verified live: a
  7-character password sent straight to Supabase Auth, bypassing the app's
  validation entirely, is rejected with "Password should be at least 8
  characters." Found via a gap between the two limits (Supabase's own
  default was 6, weaker than what the app claims to enforce) while
  reviewing Supabase's Security Advisor output.
- **Leaked-password protection (HaveIBeenPwned check) is not enabled** —
  Supabase gates this behind their paid plan tier, and both projects are
  currently on the Free plan. Flagged by Supabase's own Security Advisor;
  tracked as a real, currently-unresolvable-without-a-plan-upgrade gap
  rather than silently left off the list.

## Authorization and tenant isolation

- Enforced primarily at the database layer via Postgres Row Level Security
  (RLS), enabled on every business-owned table. A business can never read or
  write another business's data — this is enforced by RLS policies backed
  by `is_business_member(business_id)` / `has_business_role(business_id,
  roles)` SECURITY DEFINER helper functions, not by application-layer
  checks alone.
- Every `createServerFn` that touches business data runs through the
  per-request RLS-scoped Supabase client (derived from the caller's own
  session), not the service-role client — a forged `businessId` in a
  request is still rejected by RLS server-side, not just hidden by the UI.
- Role model: `owner`, `admin`, `manager`, `cashier`, `accountant`, checked
  per-action (e.g. only `owner`/`admin` can export data or override
  billing; `cashier` can record sales but not delete expenses).
- The one platform-admin capability (`src/lib/admin/`) is gated by an
  environment variable (`PLATFORM_ADMIN_USER_ID`) that is never grantable
  through the app itself — only by directly editing server configuration.
  The underlying Postgres functions it calls are independently restricted
  to the `service_role` via `GRANT`/`REVOKE`, not an in-function identity
  check (an earlier version used `current_user = 'service_role'` inside a
  `SECURITY DEFINER` function, which is unsound — `current_user` inside
  such a function always reflects the function's *owner*, never the
  caller — this was found and fixed during this session's audit).
- **The platform-admin account requires TOTP MFA**, enforced server-side on
  every admin action (`requireAdmin()` in `src/lib/admin/admin.server.ts`),
  not just as a UI gate at `/admin`'s page load — the actual data-serving
  and mutation server functions independently re-check the session's
  Authenticator Assurance Level via Supabase's own
  `getAuthenticatorAssuranceLevel()`, not a raw JWT claim read. A fresh
  sign-in starts at `aal1` and must complete a TOTP challenge before any
  admin function will run, even if the account already has a factor
  enrolled from a previous session. Verified live end-to-end against real
  Supabase Auth (enroll, correct-code accept, wrong-code reject, fresh-
  session-requires-re-challenge) — not simulated.
  Recovery if the TOTP device is lost isn't built as an in-app flow (there's
  exactly one admin account); clearing the factor via the Supabase
  dashboard/Management API is the documented recovery path for now.

## Database security

- All queries go through the Supabase client library (parameterized
  queries) — no raw SQL string concatenation in application code.
- Every server function validates its input against a Zod schema before
  it reaches business logic.
- Every multi-step write (creating a sale, invoice, product, adjusting
  stock, deleting an account's owned businesses, etc.) is a single
  `SECURITY DEFINER` Postgres function, not a sequence of separate client
  calls — so a failure partway through can't leave partial state. Row-level
  locking (`select ... for update`) is used specifically where a race
  condition would otherwise be possible (e.g. two simultaneous sales of the
  last unit of stock) — verified live this session that concurrent
  requests correctly serialize instead of both succeeding.
- Append-only audit tables (`audit_logs`, `legal_acceptances`) are
  constrained so their content can't be forged: `audit_logs` has a `CHECK`
  constraint limiting `action` to the exact set of values the app actually
  writes; `legal_acceptances` grants no `INSERT` to the `authenticated`
  role at all — only a service-role server module can write to it, and
  this was verified live (a signed-in user's own client is rejected by RLS
  when it tries to insert its own row).

## Secrets management

- The service-role Supabase client (`supabaseAdmin`, which bypasses RLS
  entirely) is restricted by an ESLint `no-restricted-imports` rule to
  exactly five files, each with a specific, narrow, documented reason to
  need it: the Paynow webhook handler, the Paynow payment-polling module,
  the platform-admin module, the account-deletion module, and the
  legal-acceptance recording module. Any new caller requires deliberately
  widening that allowlist, not just importing the client.
- No secrets are committed to the repository — `.env*` files are
  gitignored; `.env.example` documents required variables without real
  values.
- Secrets are never logged. `dbFail()` (`src/lib/business.server.ts`)
  strips raw Postgres/RLS error detail before it reaches the client,
  returning a friendly message instead — verified there's no path that
  surfaces a raw database error, connection string, or internal schema
  detail to a user.

## Rate limiting

Backed by a Postgres function (`check_rate_limit`, atomic upsert — so
concurrent requests can't race past the limit), not an in-memory store (an
earlier in-memory limiter was replaced during this session's hardening pass
specifically because it reset on every server restart and wasn't shared
across instances).

| Endpoint | Limit | Keyed by |
|---|---|---|
| Sign in | 10 / min | IP |
| Sign up | 5 / min | IP |
| Password reset request | 5 / min | IP |
| Delete account | 3 / min | user |
| Data export | 3 / min | user |
| Subscription checkout | 5 / min | user |
| Paynow webhook | 30 / min | IP |
| General authenticated API | 120 / min | user |

Rate limiting is deliberately fail-open on its own infrastructure failure
(a Postgres hiccup doesn't lock everyone out) — it's defense-in-depth on
top of RLS and authentication, not the primary security boundary.

The `rate_limit_hits` table backing this had a real gap, found via
Supabase's own Security Advisor rather than this session's own review: on
staging, RLS was disabled *and* `anon`/`authenticated` held full
INSERT/SELECT/UPDATE/DELETE grants directly on the table — an
unauthenticated caller could have hit PostgREST directly and deleted their
own bucket to bypass brute-force protection on sign-in/sign-up/password
reset entirely. Production had already drifted to a safer state (RLS
enabled, zero policies, so already blocked) independently of staging. Fixed
by enabling RLS and revoking the direct grants on both — the only
legitimate access path is `check_rate_limit()`, a `SECURITY DEFINER`
function that needs no table-level grant for the calling role. Verified
live: the exact attack (an `anon`-role `DELETE` against a real bucket) now
gets `permission denied`, and `check_rate_limit()` itself still works
correctly for real callers.

## Webhook authenticity

The Paynow webhook (`src/server.ts`) verifies Paynow's SHA512 hash over the
raw request body *before* doing any database lookup, rejecting with 401 if
it doesn't match. On top of that (not instead of it), the actual payment
status is never trusted from the webhook body directly — the handler
always re-polls Paynow's own servers via a stored `poll_url` before
crediting anything.

## Transport and response security

- `Content-Security-Policy`, `Strict-Transport-Security`,
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy`, and `Permissions-Policy` are set on every response
  (`src/start.ts`). The CSP's `script-src`/`style-src` keep `'unsafe-inline'`
  deliberately — TanStack Start's SSR hydration script and Radix UI's
  inline positioning styles need it, and there's no browser available in
  this environment to safely verify a stricter nonce-based policy wouldn't
  break the app.
- CSRF protection via TanStack Start's built-in CSRF middleware, applied to
  all server-function requests.

## Known gaps

Being direct about what hasn't been done, matching the same standard
applied to `legal/ACCESSIBILITY_STATEMENT.md`:

- **No documented backup/restore procedure or tested restore.** Whatever
  Supabase does by default for this project hasn't been independently
  verified or documented here.
- **No automated dependency vulnerability scanning** wired into the build
  or CI.
- **No SAST/DAST tooling** run against the codebase.
- **No penetration test or third-party security review** has been
  performed — everything in this document reflects internal code review
  and live functional testing, not an adversarial audit.
- **No responsible-disclosure contact** exists yet (see top of this
  document).
