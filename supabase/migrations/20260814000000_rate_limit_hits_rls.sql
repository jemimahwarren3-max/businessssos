-- Supabase's Security Advisor flagged rate_limit_hits as "RLS Disabled in
-- Public". Checked live: staging had RLS fully disabled *and* full
-- INSERT/SELECT/UPDATE/DELETE grants to anon/authenticated — meaning an
-- unauthenticated caller could hit PostgREST directly
-- (DELETE /rest/v1/rate_limit_hits?key=eq.auth-signin:ip:1.2.3.4) and wipe
-- their own bucket to bypass brute-force protection on sign-in/sign-up/
-- password-reset entirely. Production already had RLS enabled (with zero
-- policies, so already fully locked down for anon/authenticated despite
-- the same leftover grants) — the two environments had drifted; this
-- brings staging in line and removes the now-pointless direct grants on
-- both, since the only legitimate access path is check_rate_limit(), a
-- SECURITY DEFINER function that runs as its owner and needs no table-level
-- grant for the calling role at all.
alter table public.rate_limit_hits enable row level security;

revoke insert, select, update, delete, truncate, references, trigger
  on public.rate_limit_hits from anon, authenticated;
