-- Run in Supabase SQL Editor on **businessos-staging** only (slajanbsfqjnuuiohbmg).
-- Dashboard "Delete user" often fails with "Database error deleting user" when
-- public tables still reference auth.users (businesses.created_by, payment
-- confirmations, cash drawer, etc.). This removes QA data then deletes Auth.
--
-- 1. Replace the email below.
-- 2. Run the whole script once.
-- 3. Refresh Authentication → Users.

do $$
declare
  v_email text := 'REPLACE_ME@example.com';
  v_user_id uuid;
begin
  select id into v_user_id from auth.users where lower(email) = lower(v_email);
  if v_user_id is null then
    raise exception 'No auth.users row for %', v_email;
  end if;

  -- Blocks auth delete (on delete restrict)
  delete from public.shop_order_payments where confirmed_by = v_user_id;

  -- POS / team rows that reference auth.users without cascade
  delete from public.cash_movements where session_id in (
    select id from public.cash_sessions where opened_by = v_user_id
  );
  delete from public.cash_sessions where opened_by = v_user_id;
  delete from public.team_invites where created_by = v_user_id or accepted_by = v_user_id;

  -- Drop businesses this user owns (cascades members, products, storefront, etc.)
  delete from public.businesses b
  where b.id in (
    select m.business_id
    from public.business_members m
    where m.user_id = v_user_id and m.role = 'owner' and m.is_active
  );

  -- Orphan businesses still pointing at created_by
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

  raise notice 'Deleted auth user % (%)', v_email, v_user_id;
end $$;
