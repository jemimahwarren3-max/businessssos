# Auth, Google OAuth, and email — setup and testing

Two separate email systems:

| System | Purpose | Configuration |
| ------ | ------- | --------------- |
| **Supabase Auth (GoTrue)** | Signup confirmation, password reset, magic links | Supabase Dashboard → Authentication |
| **Resend (application)** | Order receipts, merchant alerts (`notification_outbox`) | `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL`, mail-flush workflow |

Setting `RESEND_API_KEY` in GitHub/Cloud Run **does not** enable Auth confirmation emails. See **`docs/auth/SUPABASE_AUTH_EMAIL.md`** (Supabase default mail is **team-only** until you add SMTP in the dashboard).

---

## Required environment variables

### Public (Vite / browser)

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

### Server only (never in client bundle)

- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (same project as Vite)
- `SUPABASE_SERVICE_ROLE_KEY` (server/admin only)
- `SESSION_SECRET` (≥32 characters) — seals `businessos_session`
- `APP_URL` — must match the URL users open (e.g. `https://mykwetuu.com`)

### Transactional (optional until you need order email)

- `RESEND_API_KEY`
- `NOTIFY_FROM_EMAIL` (verified domain in Resend)
- `MAIL_FLUSH_SECRET` (for scheduled flush job)

---

## Supabase Dashboard — Authentication

1. **Project Settings → API:** note project URL and anon key (already in env).
2. **Authentication → URL configuration**
   - **Site URL:** `https://mykwetuu.com` — **must be HTTPS**, not `http://`
   - **Redirect URLs:** add (staging project `businessos-staging` / `slajanbsfqjnuuiohbmg`)
     - `https://mykwetuu.com/auth/callback` (Google OAuth)
     - `https://mykwetuu.com/auth/callback/**`
     - `https://mykwetuu.com/auth/confirm` (signup / onboarding email)
     - `https://mykwetuu.com/auth/confirm/**`
     - `https://mykwetuu.com/auth/recover` (password reset email)
     - `https://mykwetuu.com/auth/recover/**`
     - `http://localhost:8080/auth/callback` (local dev)
     - `http://localhost:8080/auth/confirm`
     - `http://localhost:8080/auth/recover`
3. **Authentication → Providers → Email**
   - Enable email provider
   - Choose confirm email **on** or **off**:
     - **On:** users see “Confirm your email” until they click the link
     - **Off + autoconfirm (staging CI):** immediate session after signup
4. **SMTP (if not using Supabase default mail)**
   - Configure SMTP host/user/password **in Supabase**, not in Vite
   - Resend SMTP credentials go here if you use Resend for Auth (optional)
5. **Authentication → Providers → Google**
   - Enable Google
   - Client ID/secret from Google Cloud Console

---

## Google Cloud Console

Create OAuth 2.0 Client (Web application):

- **Authorized JavaScript origins:**  
  `https://mykwetuu.com`  
  `http://localhost:8080`
- **Authorized redirect URIs:**  
  `https://<YOUR_SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback`

Copy Client ID/secret into Supabase Google provider settings.

---

## Resend Dashboard (transactional only)

1. Verify domain `mykwetuu.com` (DNS records Resend provides).
2. Create API key → GitHub secret `RESEND_API_KEY`.
3. Set `NOTIFY_FROM_EMAIL` to an address on that domain (e.g. `noreply@mykwetuu.com`).
4. Confirm mail-flush workflow runs (see `.github/workflows/` mail flush).

Auth confirmation logs appear in **Supabase Auth logs**, not Resend, unless Auth SMTP uses Resend.

---

## Manual test checklist

### Email signup (Auth)

1. Open `/auth?mode=signup` with Email provider **enabled**.
2. Submit form → expect **“Confirm your email”** (if confirmation required) or redirect to **onboarding** (if autoconfirm).
3. In Supabase **Authentication → Logs**, confirm `signup` / mail event.
4. Click link in inbox → lands on `/auth/confirm` (or `/` with tokens — app forwards) → **onboarding**.

---

## Delete test users (Supabase)

Use project **`businessos-staging`** while `mykwetuu.com` points at staging Auth.

### Why dashboard delete fails

**Authentication → Users → Delete** only removes `auth.users`. Kwetuu stores merchants in **`public.businesses`** (`created_by` → auth user, **no cascade**) and other tables (e.g. **`shop_order_payments.confirmed_by`** is **ON DELETE RESTRICT**). Postgres then returns **“Database error deleting user”**.

**“User not found”** usually means the Auth row is already gone but the UI list is stale — refresh the page.

### Recommended: SQL cleanup script (staging)

1. **SQL Editor** in **businessos-staging**
2. Open `scripts/staging-delete-auth-user.sql` from the repo
3. Set `v_email := 'your-test@email.com'`
4. **Run** → refresh **Authentication → Users**

### In-app (signed-in test user)

**Settings → Account → Delete account** runs `delete_owned_businesses` then removes Auth (same FK rules; sole owner only).

**Do not** run bulk deletes on **`businessos`** (production `maidxfntfpnkcqnuhozo`) unless you intend to wipe production.

Wait ~1 minute before re-signing up with the same email.

### Resend confirmation (UI)

1. On confirm screen, click **Resend confirmation email** (60s cooldown).
2. Check Auth logs again; no duplicate success toast without request completing.

### Google OAuth

1. `/auth` → Continue with Google.
2. After Google, brief “Finishing Google sign-in…” then **onboarding** (new user) or **dashboard** (completed onboarding).
3. No bounce back to `/auth` with spinner loop.

### Protected routes

1. Logged out → `/dashboard` redirects to `/auth?mode=signin`.
2. Logged in, no business → `/onboarding`.

### Local commands

```bash
npm run verify:local   # typecheck, lint, unit tests, build
npm run test:e2e       # public smoke (optional)
```

With `SUPABASE_ACCESS_TOKEN`:

```bash
npm run verify:staging
```

---

## Troubleshooting

| Symptom | Check |
| ------- | ----- |
| Email signup disabled toast | GoTrue email provider off — enable in Supabase |
| No confirmation email | **No custom SMTP in Supabase** (built-in only mails org team) — see `SUPABASE_AUTH_EMAIL.md`; Auth SMTP / mail logs; spam folder; or enable autoconfirm |
| Stuck on “Confirm your email” forever | Enable **autoconfirm** on staging (see below) or fix Auth SMTP |
| “Confirming your email…” then error | Open the link in the **same browser** as signup; link expires after 24h |
| Google “did not finish” | Redirect URL mismatch; PKCE cookie blocked (non-HTTPS local); `APP_URL` wrong |
| Loop auth ↔ dashboard | Deploy includes PR #50+ (`finishOAuthCallback`) |
| Stuck “Checking your session” | `SESSION_SECRET` missing on server; cookie blocked |
| Orders email not sent | `RESEND_*` + outbox flush — separate from Auth |

### If sign-up still “goes nowhere” (operator checklist)

Do these in order on project **`businessos-staging`** (`slajanbsfqjnuuiohbmg`) while `mykwetuu.com` uses staging keys:

1. **Authentication → URL configuration:** Site URL = `https://mykwetuu.com` (HTTPS). Redirect URLs include `/auth/callback`, `/auth/confirm`, `/auth/recover` (see list above).
2. **Authentication → Providers → Email:** turn **Confirm email** off and enable **autoconfirm** (or run `npm run verify:staging` / CI `apply-staging-sql` when `SUPABASE_ACCESS_TOKEN` is set). New signups should jump straight to **onboarding** with no inbox step.
3. **Cloud Run env:** `APP_URL=https://mykwetuu.com`, `SESSION_SECRET` ≥ 32 chars, staging `SUPABASE_URL` + publishable + service role keys.
4. **Retest in a private window:** sign up → expect onboarding. If you used email confirm instead, complete signup and click the link in the **same** browser within 24 hours.
5. **Still broken:** Supabase **Authentication → Logs** for the attempt; DevTools → Application → Cookies on `mykwetuu.com` for `businessos_session` after a successful sign-in.
6. **Clean slate:** run `scripts/staging-delete-auth-user.sql` in SQL Editor, wait one minute, try again (see `docs/auth/DELETE_STAGING_USERS.md`).
