-- Two real gaps found by tracing actual query patterns in business.server.ts
-- (not guessed): `quotes` has no business_id-leading index at all — only
-- the (business_id, quote_number) uniqueness constraint, which doesn't
-- support listQuotes' `where business_id = ? order by created_at desc`.
-- `sale_items` is queried the same way on every single dashboard/reports
-- load (loadReports' top-products aggregation) and has only a `sale_id`
-- index — every one of those loads currently does a full scan of that
-- business's sale_items with no supporting index at all.
create index if not exists quotes_business_date_idx
  on public.quotes(business_id, created_at desc);
create index if not exists sale_items_business_date_idx
  on public.sale_items(business_id, created_at desc);

-- 3s statement timeout on the two roles actual end-user requests run as
-- (anon during sign-in/sign-up, authenticated for everything after) — a
-- stuck or accidentally-unbounded query gets cancelled instead of holding
-- a connection and degrading everyone else. Deliberately not applied to
-- service_role/postgres: webhook and platform-admin aggregate queries are
-- backend-triggered, not blocking a user's request inside this same
-- latency budget, and a report-scale aggregate shouldn't get cut off
-- arbitrarily just because a person happens to run it.
alter role authenticated set statement_timeout = '3000ms';
alter role anon set statement_timeout = '3000ms';
