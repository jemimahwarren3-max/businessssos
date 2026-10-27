# Kwetuu authentication and email — diagnostic report

**Date:** 24 October 2026 (Africa/Harare)  
**Stack:** Vite 8, React 19, TanStack Start, Supabase Auth (GoTrue), server-sealed session cookie  
**Scope:** Email/password signup, Google OAuth (PKCE), transactional Resend (separate from Auth)

Secrets are **not** recorded in this document.

---

## Architecture (confirmed)

| Layer | Evidence | Role |
| ----- | -------- | ---- |
| Browser Supabase client | `src/integrations/supabase/client.ts` | PKCE OAuth start; stores **only** `code_verifier` in a short-lived cookie; **no** access token in browser |
| Server session | `src/lib/auth/session.server.ts` | `businessos_session` httpOnly encrypted cookie via TanStack `updateSession` |
| OAuth exchange | `src/lib/auth/oauth-callback.server.ts`, `finishOAuthCallback` in `auth.functions.ts` | Single server call: exchange code → seal session → `/onboarding` or `/dashboard` |
| Route guard | `src/routes/_authenticated/route.tsx` | `getCurrentUser()`; optional MFA gate |
| Post-auth routing | `resolvePostAuthPathForUser` | Uses `loadWorkspace`; incomplete onboarding → `/onboarding` |
| Auth UI | `src/routes/auth.tsx`, `src/routes/auth.callback.tsx` | Sign-in/up, provider flags, confirmation UX |
| Transactional email | `src/lib/notifications.mail.server.ts`, outbox + GitHub mail-flush workflow | **Not** used for signup confirmation |

There is **no** React AuthContext and **no** `onAuthStateChange` in app code (by design: session is server-only).

---

## Issue 1 — Auth emails not arriving

### Confirmed

- Signup uses `createAnonClient().auth.signUp` with `emailRedirectTo` → `/auth/callback?next=/onboarding` (`auth.functions.ts`).
- **Resend API key does not configure Supabase Auth SMTP.** Transactional mail uses `RESEND_API_KEY` server-side for order/merchant notifications only.
- Staging GoTrue has had **email provider disabled** (`email_provider_disabled`); CI enables `external_email_enabled` via Management API in `scripts/apply-staging-sql.mjs` when `SUPABASE_ACCESS_TOKEN` is set.
- UI reads public settings from `/auth/v1/settings` (`fetchAuthProviderStatus`) and blocks email forms when email is off.

### Probable (dashboard verification required)

- Production Supabase project: **Authentication → Providers → Email** disabled or SMTP not configured.
- **Site URL** and **Redirect URLs** missing `https://mykwetuu.com/auth/callback` (and staging URL if used).
- Custom SMTP (Resend SMTP or Supabase built-in) not set under **Authentication → Email Templates / SMTP**.

### Repair (code)

- Clear “Confirm your email” state when `needsEmailConfirmation` (no session).
- **`resendSignupConfirmation`** server function (GoTrue `auth.resend`, rate-limited).
- Copy clarifies Auth email ≠ shop transactional email.

### Status

**Code fixed; delivery requires Supabase Auth SMTP / provider enabled and a real test inbox.**

---

## Issue 2 — Google sign-in loop / wrong screen

### Confirmed root cause (fixed on master via PR #50)

- **Two HTTP calls** in OAuth callback (`exchangeOAuthCode` then `getPostAuthDestination`) allowed `tryGetAuthedContext()` to miss the new cookie → redirect to `/auth` while `/auth` auto-sent users to `/dashboard` → loop.
- **`finishOAuthCallback`** now performs exchange + destination in **one** server function using `resolvePostAuthPathForUser(accessToken, userId)` without relying on a second request.

### Additional fixes (this branch)

- `/auth` waits for session probe (`bootState`) before showing the form.
- Already-signed-in users use `getPostAuthDestination()` (not hardcoded `/dashboard`).
- Callback route shows “Finishing Google sign-in…” instead of a blank page.

### External checks

- Supabase **Redirect URLs**: `{APP_URL}/auth/callback`
- Google Cloud OAuth client: authorized JavaScript origin = site origin; redirect URI = `https://<project-ref>.supabase.co/auth/v1/callback`
- Cloud Run **`APP_URL`** must match the browser host (cookie `Secure` flag uses `APP_URL` in `session-cookie.ts`).

### Status

**Fixed in code; verify after deploy with live Google sign-in.**

---

## Issue 3 — Infinite signup spinner

### Confirmed

- `busy` state cleared in `finally` on email submit (`auth.tsx`).
- Infinite spin more often from **`/_authenticated` MFA probe** (“Signing you in…”) when session missing, or **auth page** auto-redirect racing with form render.

### Repair

- Auth page **`bootState`**: explicit “Checking your session…” then form or redirect.
- Signup with confirmation required sets **`sentTo`** and exits loading (no navigation to protected routes without session).

### Status

**Fixed in code; retest signup with email off vs on.**

---

## Issue 4 — Duplicate businesses

### Confirmed

- Business creation is **`create_business_with_owner`** RPC from onboarding (`onboarding.tsx`), not on every login.
- OAuth/login only establishes auth session; workspace loaded via `loadWorkspace`.

### Status

**No duplicate-business bug identified in login path.**

---

## Regression tests (added/updated)

| Test | File |
| ---- | ---- |
| Provider flags | `tests/auth-providers.test.ts` |
| Signup error copy | `tests/signup-errors.test.ts` |
| OAuth post-auth without session | `tests/oauth-callback.test.ts` |
| Resend / unconfirmed copy | `tests/auth-resend.test.ts` (this branch) |

Staging integration tests require `SUPABASE_ACCESS_TOKEN`; they do not send real Auth emails.

---

## Repair plan summary

1. **Merged to master:** PR #49 (verification), PR #50 (OAuth loop + templates).
2. **This branch:** resend confirmation, auth UX states, diagnostic docs, focused unit tests.
3. **Operator:** Enable Supabase Email + redirect URLs; optional Resend SMTP for Auth; keep `RESEND_API_KEY` for transactional outbox separately.

See `docs/auth/AUTH_SETUP_AND_TESTING.md` for step-by-step dashboard configuration.
