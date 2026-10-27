# Supabase Auth email — why nothing arrives and how to fix it

Kwetuu uses **two different email systems**:

| Mail | Who sends it | Configured where |
| ---- | ------------ | ---------------- |
| Signup confirm, password reset | **Supabase GoTrue** | Supabase Dashboard → Authentication → **SMTP** |
| Order receipts, merchant alerts | **Resend API** (app outbox) | Cloud Run `RESEND_API_KEY`, GitHub mail-flush |

Setting `RESEND_API_KEY` on Cloud Run **does not** send signup confirmation emails. You must configure SMTP **inside Supabase** (or turn on autoconfirm so signup skips email).

---

## Why confirmation emails never show up (most common)

Supabase’s **default** mail server (when you have **not** configured custom SMTP) only delivers to **email addresses that belong to your Supabase organization team**. Random customer Gmail addresses are **not** sent mail — Auth logs may show a send failure, and the app stays on “Confirm your email”.

This is documented by Supabase: [Send emails with custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

**Fix (pick one):**

### Option A — Skip email on staging (fastest for beta)

1. Open project **`businessos-staging`** (`slajanbsfqjnuuiohbmg`).
2. **Authentication → Providers → Email** → disable “Confirm email” / enable **autoconfirm** (wording varies in UI).
3. Or let CI apply it: ensure GitHub secret **`SUPABASE_ACCESS_TOKEN`** is set; every push to `master` runs `scripts/apply-staging-sql.mjs`, which sets `external_email_enabled` + `mailer_autoconfirm`.

After autoconfirm, email signup returns a session immediately and the app sends users to **onboarding** — no inbox step.

### Option B — Send real mail to any address (production-ready)

Use **Resend SMTP** in Supabase (same Resend account as order mail; domain must be verified).

1. **Resend:** verify `mykwetuu.com`, create an API key (`re_…`).
2. **Supabase → Authentication → SMTP settings** (or **Project Settings → Auth**):

   | Field | Value |
   | ----- | ----- |
   | Host | `smtp.resend.com` |
   | Port | `465` (SSL) or `587` (TLS) |
   | User | `resend` |
   | Password | Your Resend **API key** (`re_…`) |
   | Sender email | `noreply@mykwetuu.com` (must be on verified domain) |
   | Sender name | `Kwetuu` |

3. **Authentication → Providers → Email** → enable email provider.
4. Send a test signup; check **Authentication → Logs** and Resend’s dashboard.

**Automated (optional):** with `SUPABASE_ACCESS_TOKEN`, `RESEND_API_KEY`, and `NOTIFY_FROM_EMAIL` in the environment:

```bash
node scripts/configure-staging-auth-smtp.mjs
```

Or add `RESEND_API_KEY` + `NOTIFY_FROM_EMAIL` to the GitHub Actions “Apply staging SQL” step so CI configures SMTP on each deploy.

---

## Check current staging settings

With a personal access token from [Supabase Account → Tokens](https://supabase.com/dashboard/account/tokens):

```bash
export SUPABASE_ACCESS_TOKEN="sbp_..."
node scripts/check-staging-auth-email.mjs
```

Look for:

- `external_email_enabled: true`
- `mailer_autoconfirm: true` **or** `smtp_host: "smtp.resend.com"`

---

## Google “400. That’s an error.” (separate from SMTP)

That page is **Google OAuth**, not the mail server. It usually means the OAuth request Google received was malformed.

Checklist for **`businessos-staging`**:

1. **Authentication → Providers → Google** — Client ID and Client Secret filled in (from Google Cloud Console).
2. **Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client (Web):**
   - **Authorized JavaScript origins:** `https://mykwetuu.com` (and `http://localhost:8080` for local dev).
   - **Authorized redirect URIs:** exactly  
     `https://slajanbsfqjnuuiohbmg.supabase.co/auth/v1/callback`  
     (replace ref if you change projects — **not** `https://mykwetuu.com/auth/callback` on the Google side).
3. **Supabase → Authentication → URL configuration:**
   - **Site URL:** `https://mykwetuu.com`
   - **Redirect URLs:** include `https://mykwetuu.com/auth/callback` and `/auth/confirm`, `/auth/recover`.

If Google is broken, use **email signup with autoconfirm** (Option A) until OAuth credentials are fixed.

---

## Resend confirmation from the app

The “Resend confirmation email” button calls Supabase `auth.resend`. It still depends on the same GoTrue SMTP settings above — if SMTP is not configured, resend fails too.

---

## Related docs

- `docs/auth/AUTH_SETUP_AND_TESTING.md` — redirect URLs, manual tests
- `docs/auth/AUTH_DIAGNOSTIC_REPORT.md` — architecture notes
- `.env.example` — `RESEND_*` is for **shop** mail, not Auth SMTP
