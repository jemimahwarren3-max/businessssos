# Production go-live checklist

Every box is evidence-based. Unverified stays unchecked.

## Security

- [ ] No known unresolved critical vulnerabilities. `npm audit` still reports critical/high issues. Unverified as cleared.
- [ ] Tenant isolation verified through direct API and database tests. Tests exist; not executed in this environment (no access token in `.env`).
- [ ] Authentication and role permissions tested. Existing integration tests; not re-run here.
- [x] Secrets protected in source. `.env` gitignored; example file has no live values. Git history not exhaustively scanned with a dedicated secret scanner.
- [x] File upload validation for product photos (type sniff + 2 MB). Expense/docs uploads still absent. No antivirus.
- [x] Rate limiting reviewed. Postgres `check_rate_limit` on auth, export, checkout, webhooks, marketplace browse.
- [x] Security headers present in code (`src/start.ts`). Not verified against a live Cloud Run URL.

## Data and payments

- [x] Database constraints and migrations reviewed in repo. Production has not received storefront migrations.
- [ ] Inventory concurrency tested this session. Older tests exist; not re-run here.
- [ ] Payment verification with Paynow's real test process. Not run.
- [x] Duplicate webhook processing designed to no-op after `status != created`.
- [x] Financial records auditable via `sales`, `sale_refunds`, `audit_logs`, `store_order_events`.
- [x] Money stored as `numeric` in SQL. JS display rounding is IEEE float; checkout totals are recomputed in SQL.

## Privacy and legal

- [x] Data inventory written (`DATA_INVENTORY_AND_PRIVACY.md`).
- [ ] Privacy and retention legally assessed.
- [ ] CDPA / POTRAZ reviewed by counsel.
- [ ] Legal pages name a real operator.
- [ ] Merchant vs platform responsibilities signed.
- [ ] Tax / fiscalisation investigated by a practitioner.
- [x] Unresolved legal questions listed.

## Reliability

- [ ] Backup secrets confirmed on GitHub.
- [ ] Restore test completed.
- [ ] Monitoring alerts tested. Sentry optional and unproven.
- [x] Incident procedure documented.
- [ ] Deployment and rollback actually exercised on Cloud Run.

## Caching and offline

- [x] Document caching removed from the service worker; merchant pages `no-store`.
- [ ] Public cache invalidation tested in a browser.
- [x] Private data caching reviewed.
- [x] Offline capabilities documented.
- [x] Pending sync visible on the sales page (existing UI).
- [x] Duplicate online retries use idempotency keys (sales and store orders).
- [x] Inventory conflicts fail the offline sale instead of overwriting server stock.
- [ ] Service worker update with pending sales tested.

## Quality

- [x] Targeted unit tests added/updated this stage (run locally).
- [ ] Production Docker/Cloud Run image built in this environment. Dockerfile and a manual GitHub deploy workflow exist; this agent has not built in GCP.
- [ ] Mobile layouts re-tested this session.
- [ ] Accessibility issues independently reviewed.
- [ ] Core journeys tested against staging in a browser this session.
- [x] Storefront does not fake payment success.
- [x] Limitations documented.

**Gate decision: do not mark public production ready.**
