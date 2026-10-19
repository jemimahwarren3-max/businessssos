# Backup and disaster recovery

Extends `docs/disaster-recovery.md`. Official compute target is **Google Cloud Run**. Render is temporary. Database remains Supabase production `maidxfntfpnkcqnuhozo`.

## What exists

- GitHub workflow `.github/workflows/backup.yml`: nightly `pg_dump` of `public` + `auth`, GPG encrypted, 14-day Actions artifact.
- Requires secrets `SUPABASE_DB_PASSWORD` and `BACKUP_ENCRYPTION_PASSPHRASE`.
- Supabase free tier: no PITR (previously confirmed). Do not assume dashboard backups exist.

## What does not exist

- A restore test recorded with date and operator.
- Backup of GitHub artifacts into a second region.
- Object storage backup (no buckets).
- Cloud Run revision rollback drill.

## RPO / RTO (targets, not demonstrated)

- RPO: up to 24 hours plus any failed nightly run.
- RTO: hours, depending on creating a Supabase project and pointing Cloud Run env vars. Not timed.

## Cloud Run recovery

1. Redeploy a previous Cloud Run revision (stateless). Data is not in the container.
2. If the database is wrong, restore SQL into staging or a new project first, never blindly onto production.
3. Update `APP_URL`, Paynow webhook URL, and wildcard DNS together.

## Last successful restore test

None recorded.
