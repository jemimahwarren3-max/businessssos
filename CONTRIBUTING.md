# Contributing to BusinessOS

## Working copy

Use a feature branch `cursor/<descriptive-name>-dafe` from the current integration branch, not an unreviewed rewrite of `master`.

## Before you change code

1. Read `AGENTS.md`, `SECURITY.md`, and the relevant file in `docs/`.
2. Confirm whether the behaviour already exists. Reuse tables and RPCs.
3. Run `npx tsc --noEmit` and `npm test` so you can tell baseline failures from your own.

## Database

- Add a new timestamped file under `supabase/migrations/`.
- Prefer `create or replace function` and `add column if not exists`.
- Multi-step money and stock updates belong in one transaction.
- Snapshot agreed prices, fees, currency, and merchant rules on the order. Later setting changes must not rewrite history.
- Apply to staging first. Never apply to production without explicit approval.

## Product honesty

- Empty states when there is no data. No fabricated analytics.
- Disabled payment and fulfilment methods must not appear as available.
- WhatsApp is link-based unless a real provider send is configured.
- Customer Paynow is not available. Do not add a pretend checkout success.

## Tests

Add regression tests next to the behaviour you change. Critical paths: tenant isolation, checkout totals, payment status, stock reservation, unpublished products staying private, verified-purchase reviews.

Remaining product work is batched in `docs/ROADMAP_REMAINING.md`. Finish one vertical slice. Do not stub the rest of the 200-item list.

## Pull requests

Describe what was implemented, what was preserved, migrations, commands run, and remaining limitations. Do not claim a build or integration succeeded unless you ran it.
