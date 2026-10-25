# Delete staging users (when the dashboard fails)

Use project **businessos-staging** (`slajanbsfqjnuuiohbmg`). Dashboard **Delete user** fails with *Database error deleting user* when the person created a shop — Postgres blocks deleting `auth.users` while `public.businesses` and other rows still reference them.

## Easiest: reset all staging logins (one paste)

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → **businessos-staging**.
2. Left menu → **SQL Editor** → **New query**.
3. Open this file from the repo: **`scripts/staging-reset-all-auth-users.sql`**
4. Copy **the entire file** into the editor.
5. Click **Run** (bottom right).
6. Open **Authentication → Users** and refresh the page — the list should be empty (or only non-app accounts).

Wait one minute, then sign up again on https://mykwetuu.com.

## Delete one email only

1. Same **SQL Editor** in **businessos-staging**.
2. Copy **`scripts/staging-delete-auth-user.sql`**
3. Change line 12: `v_email := 'your-real-email@gmail.com';`
4. **Run** once → refresh **Authentication → Users**.

## From your laptop (optional)

If you have a [Supabase access token](https://supabase.com/dashboard/account/tokens):

```bash
export SUPABASE_ACCESS_TOKEN="sbp_..."
node scripts/staging-delete-auth-user.mjs --list
node scripts/staging-delete-auth-user.mjs --email you@example.com
```

## Never

Do **not** run these scripts on **businessos** (production `maidxfntfpnkcqnuhozo`).
