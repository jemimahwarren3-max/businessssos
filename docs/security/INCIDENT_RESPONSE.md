# Incident response (Kwetuu)

Operational runbook for this codebase. **Not legal advice.** For Zimbabwe CDPA/POTRAZ notification obligations, engage qualified counsel.

## Severity

| Level | Examples | Response time target |
|-------|----------|---------------------|
| S0 | Active cross-tenant leak, exposed service role in public, payment forgery | Immediate contain |
| S1 | Auth bypass, admin RPC exposed, webhook bypass | Hours |
| S2 | Rate limit abuse, spam, single-account compromise | Same day |
| S3 | Dependency CVE, non-exploitable config | Planned patch |

## Detect

- Spike in `rate_limit_hits`
- User report of wrong business data
- Paynow reconciliation mismatch
- GitHub secret scanning / unexpected Cloud Run env change
- Failed mail flush job (GitHub Actions)

## Contain

- Rotate compromised secret (Supabase API, SESSION_SECRET, PAYNOW_*, SHOP_PAYMENT_ENCRYPTION_KEY, MAIL_FLUSH_SECRET) via dashboard/GitHub — update Cloud Run, redeploy.
- Disable seller Paynow gate if shop payments abused.
- Revoke platform roles in SQL (service_role) if admin compromise suspected.
- Set `BILLING_ENABLED=false` only if billing logic suspect (does not fix RLS issues).

## Eradicate / recover

- Patch and deploy from `master`; replay migrations only through reviewed process.
- Restore DB from backup to isolated project before production restore (see `BACKUP_AND_RECOVERY.md`).

## Preserve evidence

- Export relevant `audit_logs`, `store_order_events`, `platform_admin_audit`, Paynow dashboard logs (no full PAN/secrets).

## Communicate

- Internal: document timeline in ticket.
- External notification: legal review required; do not promise timelines in this doc.

Full detail: `../INCIDENT_RESPONSE.md` (legacy, same architecture references).
