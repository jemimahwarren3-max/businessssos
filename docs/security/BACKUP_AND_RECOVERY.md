# Backup and recovery

## What exists

- **Supabase:** Point-in-time recovery depends on project plan (verify in Supabase dashboard for staging/production).
- **GitHub workflow:** `.github/workflows/backup.yml` — encrypted DB dump when `SUPABASE_DB_PASSWORD` and `BACKUP_ENCRYPTION_PASSPHRASE` secrets set.

## RPO / RTO (targets — not proven)

| Tier | RPO | RTO | Notes |
|------|-----|-----|-------|
| Staging | 24h | 4h | Acceptable for test data |
| Production | 1h | 4h | Requires verified PITR + runbook drill |

## Recovery procedure (staging drill)

1. Create new Supabase project or restore branch (non-production).
2. Restore backup or PITR to timestamp before test incident.
3. Run smoke tests: auth, one business login, one storefront order read.
4. Document actual elapsed time and gaps.

**Status:** **blocked** — no restore drill executed in this programme (see `SECURITY_STATUS.md`).

See also: `../BACKUP_AND_DISASTER_RECOVERY.md`, `../disaster-recovery.md`.
