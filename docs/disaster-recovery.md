# Disaster recovery

## What's backed up

`.github/workflows/backup.yml` runs every night at 02:00 UTC (and on demand
via the Actions tab → "Nightly production backup" → "Run workflow"). It
dumps the production database's `public` and `auth` schemas, encrypts the
dump, and keeps it as a GitHub Actions artifact for 14 days.

`auth` is included, not just `public` — if a restore only brought back
`public`, every row that references a `user_id` (business_members, and
everything downstream of it) would point at auth accounts that no longer
exist. Restoring both together keeps those IDs intact.

**One-time setup**, before the first run does anything useful — add two
repository secrets (Settings → Secrets and variables → Actions):

- `SUPABASE_DB_PASSWORD` — the production database password. Reset it from
  the Supabase dashboard (Project Settings → Database → Reset database
  password) if you don't have it recorded anywhere; resetting it doesn't
  break the running app, since it authenticates the Postgres connection
  directly, not the app's own Supabase client keys.
- `BACKUP_ENCRYPTION_PASSPHRASE` — a long random passphrase, used to encrypt
  every dump. **Save it somewhere outside GitHub too** (a password manager) —
  if it only lives in the GitHub secret and the repo or account is ever
  lost, every backup becomes unreadable along with it.

## Restoring a backup

You'll need `postgresql-client` (for `pg_restore`) and `gpg` installed
locally, or run these same steps in a throwaway GitHub Actions job.

1. Download the artifact from the failed/target run (Actions tab → the run →
   the artifact at the bottom of the page) — you'll get a `.zip` containing
   `backup.dump.gpg`.
2. Decrypt it:
   ```
   gpg --batch --yes --decrypt --passphrase "<BACKUP_ENCRYPTION_PASSPHRASE>" \
     backup.dump.gpg > backup.dump
   ```
3. Restore into a database. Two real scenarios:
   - **The production project itself is intact, but data got corrupted or
     deleted** — restore into it directly. This will error on rows that
     already exist; for a full rollback, drop and recreate the `public` and
     `auth` schemas first (destructive — only do this once you're certain):
     ```
     pg_restore --no-owner --no-privileges --clean --if-exists \
       -d "postgresql://postgres:<db-password>@db.maidxfntfpnkcqnuhozo.supabase.co:5432/postgres" \
       backup.dump
     ```
   - **The whole Supabase project is gone** — create a brand-new Supabase
     project first (this gives you a fresh, empty `auth`/`storage`/etc. that
     the dump will restore into), then run the same `pg_restore` command
     against the new project's connection string. Afterward, update
     `.env.production` (and Cloud Run, or the temporary Render service) to
     point at the new project's URL/keys. Official hosting is Cloud Run.
4. Sanity-check the restore before trusting it: confirm `select count(*)
   from businesses;` and a spot-checked row match what you expect, and try
   signing in as a real account.

## Testing this actually works

Don't wait for a real disaster to find out the dump is malformed or the
passphrase is wrong. Periodically (e.g. after any major schema change),
run the restore steps above against a **throwaway** Supabase project —
never against production — and confirm the data comes back intact.
