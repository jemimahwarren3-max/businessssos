-- Fixes a real bug found while adding the first long-window (24h) buckets
-- for per-business daily AI usage caps.
--
-- check_rate_limit's opportunistic sweep deletes rows table-wide (not
-- scoped to the calling key) using a cutoff derived from *that call's own*
-- _window_seconds: `now() - (_window_seconds * 3) seconds`. Every bucket
-- in the app used a 60s window until now, so that cutoff (~180s) was
-- always self-consistent with every row in the table. But a 24h-window
-- row's window_start is anchored to the start of the current UTC day —
-- for most of the day that's many hours "in the past" relative to now().
-- Any *other*, unrelated 60s-window check running concurrently anywhere
-- in the app (which happens constantly — every API call touches one)
-- sweeps with a ~180s cutoff and silently deletes that daily row,
-- resetting its count to 1 on the next hit. Confirmed live against
-- staging: a 24h bucket tested in isolation enforced its limit correctly,
-- but failed under the same load real traffic produces (concurrent
-- short-window checks sweeping the table).
--
-- Fix: sweep on a fixed, generous retention window (25h — enough to cover
-- the longest window currently in use, the 24h AI daily caps, with an
-- hour of buffer) instead of one derived from the current call's own
-- window. Slightly less aggressive cleanup for 60s buckets (rows now
-- live up to 25h instead of ~3min before being swept), which is harmless
-- — row volume is still bounded by distinct (key, window_start) pairs,
-- nowhere near a real problem at this app's scale.
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

  delete from public.rate_limit_hits where window_start < now() - interval '25 hours';

  return v_count <= _limit;
end;
$$;
