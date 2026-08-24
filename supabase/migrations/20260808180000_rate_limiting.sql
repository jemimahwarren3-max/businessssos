-- Replaces the in-memory rate limiter in src/lib/security.ts (a Map that's
-- empty again on every restart and never shared across instances) with a
-- Postgres-backed one: fixed one-minute buckets, one atomic upsert per
-- check so concurrent requests can't race past the limit.
create table public.rate_limit_hits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 1,
  primary key (key, window_start)
);
-- Buckets are only ever looked up by their own (key, window_start) primary
-- key, and old ones are swept opportunistically below — no extra index
-- needed.

create or replace function public.check_rate_limit(
  _key text,
  _limit int,
  _window_seconds int
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_window_start timestamptz;
  v_count int;
begin
  v_window_start := to_timestamp(floor(extract(epoch from now()) / _window_seconds) * _window_seconds);

  insert into public.rate_limit_hits (key, window_start, count)
  values (_key, v_window_start, 1)
  on conflict (key, window_start) do update set count = rate_limit_hits.count + 1
  returning count into v_count;

  -- Opportunistic sweep of expired buckets — cheap (indexed PK range) and
  -- means this table never needs a cron job just to stay small.
  delete from public.rate_limit_hits where window_start < now() - (_window_seconds * 3 || ' seconds')::interval;

  return v_count <= _limit;
end;
$$;
revoke all on function public.check_rate_limit(text, int, int) from public;
grant execute on function public.check_rate_limit(text, int, int) to authenticated, anon, service_role;
