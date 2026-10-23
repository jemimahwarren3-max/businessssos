# Kwetuu implementation plan

This is the dependency-ordered plan for the full commerce-platform brief. The
repository already contains substantial pieces of several stages; the plan is
not a claim that every feature is complete.

| Stage                           | Scope                                                                             | Current assessment / next work                                                                                                                                                                                               |
| ------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Audit and baseline           | Map routes, schema, security, deployment and tests                                | Existing audits are in `BUSINESSOS_AUDIT.md`, `KWETUU_FULL_AUDIT_2026-10-23.md` and `SECURITY_REVIEW.md`; this branch adds the requested concise audit set.                                                                  |
| 1. Domain and permissions       | Businesses, memberships, products, stock, RLS and safe migrations                 | Core models and permissions exist. Verify drifted staging schema and coverage; do not recreate the domain.                                                                                                                   |
| 2. Products and inventory       | Shared catalogue, imports, visibility, movements, reservations                    | Core product/stock/POS exists. Variants, transfer UI and complete import/count workflows remain gaps.                                                                                                                        |
| 3. Storefront                   | Routing, templates, preview, publishing, responsive and SEO                       | Storefront, ten templates and draft/publish paths exist. Verify launch eligibility and domain operations against staging.                                                                                                    |
| 4. Shopping                     | Marketplace, cart, checkout, customer details, server pricing                     | Implemented in repository for one shop per cart; improve only against tested gaps.                                                                                                                                           |
| 5. Orders and payments          | Immutable order totals, safe payment methods, callbacks, reconciliation, receipts | Current active slice: manual confirmation audit evidence and Paynow safety. Staging migration/integration validation remains blocked on staging execution authorization/access. Provider approvals remain external blockers. |
| 6. Fulfilment                   | Seller order actions, collection/delivery, dispatch and notifications             | Core order state and notifications exist. Tracking, returns/refunds and complete edge-case coverage remain gaps.                                                                                                             |
| 7. Subscription and publication | Platform subscription, launch eligibility, expiry and renewal                     | Subscription code exists; verify entitlement and launch rules. Automated seller payment must remain separate.                                                                                                                |
| 8. Admin and trust              | Moderation, disputes, subscription oversight, audit and monitoring                | Admin and audit surfaces exist; dispute case management and operational coverage need assessment.                                                                                                                            |
| 9. Growth and polish            | Promotions, analytics, repeat shopping, accessibility and performance             | Partial or unimplemented; prioritize based on user evidence after core operations are verified.                                                                                                                              |

## Immediate sequence

1. Review the payment migration, grants and idempotent staging replay behavior.
2. Keep seller Paynow globally disabled and verify the manual checkout path is
   unchanged.
3. Apply the migration to **staging only** through the approved staging
   workflow, then run staging payment, RLS, and tenant-isolation tests.
4. Fix any migration or integration failures and record actual evidence in
   `EXECUTION_STATUS.md`.
5. Do not enable seller Paynow or apply production changes until written
   provider permission, legal review, and deployment/database authorization
   are established.
6. After this slice, select the next verified gap from the staged roadmap;
   avoid broad rewrites or adding disconnected features.
