# Security test plan

## Automated (CI / local)

| Suite | Path | When run |
|-------|------|----------|
| Unit + regression | `tests/*.test.ts` | Every PR (`npm test`) |
| Audit hardening | `tests/audit-hardening.test.ts` | Every PR |
| Billing write gate | `tests/billing-write.test.ts` | Every PR |
| Paynow foundation | `tests/paynow-foundation.test.ts` | Every PR |
| CSV injection | `tests/csv-export-security.test.ts` | Every PR |
| Security docs present | `tests/security-docs.test.ts` | Every PR |
| Staging integration | `tests/integration/*.test.ts` | When `SUPABASE_ACCESS_TOKEN` set |

### Staging integration (required before launch)

- `tenant-isolation.test.ts`
- `billing-security.test.ts`
- `payment-safety.test.ts`
- `platform-owner-security.test.ts`
- `permissions.test.ts`

## Manual (staging browser)

- Google OAuth complete loop
- Guest checkout → proof upload → merchant mark paid (no auto-paid)
- Draft shop not visible publicly; preview requires membership
- Admin 404 for non-admin; MFA gate for admin

## Not in scope (unless commissioned)

- External penetration test
- DAST against production
- Load/fuzz testing

## Pass criteria for release candidate

- All non-skipped tests green
- Staging integration green after migrations applied
- No open Critical/High in `SECURITY_REMEDIATION_LOG.md` without accepted risk + owner

See also: `../TEST_PLAN.md`, `../TEST_STRATEGY.md`.
