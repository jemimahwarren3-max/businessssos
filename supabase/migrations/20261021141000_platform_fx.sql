-- Single displayed ZiG equivalent for the US$7 plan. Not an automatic feed.
-- Operators type the rate, source, and date. Shopper money is never converted with this.

create table if not exists public.platform_fx (
  id integer primary key default 1 check (id = 1),
  usd_to_zwg numeric(14,6) not null check (usd_to_zwg > 0),
  source text not null check (char_length(source) between 3 and 120),
  effective_on date not null,
  notice text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid
);

revoke all on table public.platform_fx from public, anon, authenticated;
grant select on table public.platform_fx to anon, authenticated;
grant select, insert, update, delete on table public.platform_fx to service_role;

alter table public.platform_fx enable row level security;

drop policy if exists platform_fx_read on public.platform_fx;
create policy platform_fx_read on public.platform_fx
  for select
  to anon, authenticated
  using (true);
