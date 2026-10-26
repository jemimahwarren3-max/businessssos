# Production security checklist

Use before enabling public production traffic. Evidence-based — unchecked items are not claimed.

## Identity & access

- [ ] Platform owner bootstrapped; bootstrap function no longer needed or disabled
- [ ] `PLATFORM_ADMIN_USER_ID` set to real operator UUID; MFA enrolled
- [ ] No default/test passwords in production Auth
- [ ] Staff invites use hashed tokens; owner role not grantable via UI misuse

## Database

- [ ] All migrations applied to production in reviewed order
- [ ] RLS enabled on tenant tables (spot-check via Supabase dashboard)
- [ ] Integration tenant-isolation tests run against production-like staging
- [ ] Service role key never in client bundle (verify build artifacts)

## Payments

- [ ] Manual payment playbook published for sellers
- [ ] Seller Paynow remains disabled OR written provider approval on file
- [ ] Platform `PAYNOW_*` only for subscription billing
- [ ] Webhook URL HTTPS and registered with Paynow
- [ ] `BILLING_ENABLED` intentional for go-live

## Application

- [ ] `SESSION_SECRET` ≥32 chars, unique per environment
- [ ] `SHOP_PAYMENT_ENCRYPTION_KEY` set before any shop credentials stored
- [ ] `MAIL_FLUSH_SECRET` set; flush workflow green
- [ ] TanStack GHSA is patched in the repository; verify the patched build is deployed or record an owner-accepted risk for the live environment.
- [ ] Security headers verified on live URL (curl)

## Operations

- [ ] Backup secrets configured; restore drill completed
- [ ] Incident response contacts documented
- [ ] Monitoring (Sentry optional) receiving events
- [ ] Rate limit anomalies review procedure

## Legal / privacy

- [ ] Privacy/Terms name real operator
- [ ] Legal review for CDPA/marketing (counsel)

**Gate:** Do not claim "secure launch" — only "checklist complete with listed exceptions."

Master list: `SECURITY_STATUS.md`.
