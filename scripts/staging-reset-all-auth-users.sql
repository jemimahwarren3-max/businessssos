-- =============================================================================
-- STAGING ONLY — businessos-staging (slajanbsfqjnuuiohbmg)
-- Wipes ALL Auth users and their Kwetuu businesses so you can sign up fresh.
-- Do NOT run on production (businessos / maidxfntfpnkcqnuhozo).
--
-- How to run:
--   1. Supabase Dashboard → businessos-staging → SQL Editor → New query
--   2. Paste this entire file → Run
--   3. Authentication → Users → refresh (should be empty or only service accounts)
-- =============================================================================

create or replace function pg_temp.kwetuu_purge_auth_user(v_user_id uuid)
returns void
language plpgsql
as $$
begin
  if v_user_id is null then
    return;
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'shop_order_payments'
  ) then
    execute 'delete from public.shop_order_payments where confirmed_by = $1' using v_user_id;
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'cash_movements'
  ) then
    delete from public.cash_movements where session_id in (
      select id from public.cash_sessions where opened_by = v_user_id
    );
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'cash_sessions'
  ) then
    delete from public.cash_sessions where opened_by = v_user_id;
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'team_invites'
  ) then
    delete from public.team_invites
    where created_by = v_user_id or accepted_by = v_user_id;
  end if;

  delete from public.businesses b
  where b.id in (
    select m.business_id
    from public.business_members m
    where m.user_id = v_user_id and m.role = 'owner' and m.is_active
  );

  delete from public.businesses where created_by = v_user_id;
  delete from public.business_members where user_id = v_user_id;

  update public.business_members set invited_by = null where invited_by = v_user_id;
  update public.inventory_movements set created_by = null where created_by = v_user_id;
  update public.sales set created_by = null where created_by = v_user_id;
  update public.invoices set created_by = null where created_by = v_user_id;
  update public.quotes set created_by = null where created_by = v_user_id;
  update public.payments set created_by = null where created_by = v_user_id;
  update public.expenses set created_by = null where created_by = v_user_id;

  delete from auth.users where id = v_user_id;
end;
$$;

do $$
declare
  r record;
  n int := 0;
begin
  for r in select id, email from auth.users order by created_at loop
    perform pg_temp.kwetuu_purge_auth_user(r.id);
    n := n + 1;
    raise notice 'Purged % (%)', r.email, r.id;
  end loop;
  raise notice 'Done. Purged % auth user(s).', n;
end $$;

-- Optional: see who is left (should return 0 rows)
select id, email, created_at from auth.users order by created_at;
