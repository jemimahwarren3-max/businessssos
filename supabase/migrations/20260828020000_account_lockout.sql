-- Per-account sign-in lockout. The existing signInLimit (see
-- rate-limit.server.ts) is IP-keyed — it stops one machine from hammering
-- sign-in, but does nothing against a distributed credential-stuffing
-- attempt (many IPs, one targeted email). These three functions add a
-- second, email-keyed counter that only moves on an actual failed
-- password check, cleared on success, reusing the same rate_limit_hits
-- table and fixed-window bucketing as check_rate_limit (see
-- 20260808180000_rate_limiting.sql / 20260814010000_fix_rate_limit_sweep.sql)
-- rather than standing up a parallel mechanism.

create or replace function public.record_login_failure(
  _key text,
  _window_seconds int
) returns int
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

  delete from public.rate_limit_hits where window_start < now() - interval '25 hours';

  return v_count;
end;
$$;
revoke all on function public.record_login_failure(text, int) from public;
grant execute on function public.record_login_failure(text, int) to authenticated, anon, service_role;

-- Read-only — unlike check_rate_limit, this must NOT count as an attempt
-- itself, or every legitimate sign-in page load/retry would tick the
-- lockout counter on its own.
create or replace function public.peek_login_failures(
  _key text,
  _window_seconds int
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_window_start timestamptz;
  v_count int;
begin
  v_window_start := to_timestamp(floor(extract(epoch from now()) / _window_seconds) * _window_seconds);
  select count into v_count from public.rate_limit_hits
    where key = _key and window_start = v_window_start;
  return coalesce(v_count, 0);
end;
$$;
revoke all on function public.peek_login_failures(text, int) from public;
grant execute on function public.peek_login_failures(text, int) to authenticated, anon, service_role;

create or replace function public.clear_login_failures(_key text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.rate_limit_hits where key = _key;
end;
$$;
revoke all on function public.clear_login_failures(text) from public;
grant execute on function public.clear_login_failures(text) to authenticated, anon, service_role;
