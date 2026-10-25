-- =============================================================================
-- STAGING ONLY — businessos-staging (slajanbsfqjnuuiohbmg)
-- Wipes ALL Auth users and their Kwetuu businesses so you can sign up fresh.
-- Safe when migrations are partially applied (skips missing tables/columns).
-- =============================================================================

create or replace function pg_temp.kwetuu_has_column(
  p_table text, p_column text
) returns boolean
language sql stable as $$
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = p_table
      and column_name = p_column
  );
$$;

create or replace function pg_temp.kwetuu_has_table(p_table text)
returns boolean
language sql stable as $$
  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = p_table
  );
$$;

create or replace function pg_temp.kwetuu_purge_auth_user(v_user_id uuid)
returns void
language plpgsql
as $$
begin
  if v_user_id is null then
    return;
  end if;

  if pg_temp.kwetuu_has_table('shop_order_payments')
     and pg_temp.kwetuu_has_column('shop_order_payments', 'confirmed_by') then
    delete from public.shop_order_payments where confirmed_by = v_user_id;
  end if;

  if pg_temp.kwetuu_has_table('cash_movements') and pg_temp.kwetuu_has_table('cash_sessions') then
    delete from public.cash_movements where session_id in (
      select id from public.cash_sessions where opened_by = v_user_id
    );
  end if;

  if pg_temp.kwetuu_has_table('cash_sessions') then
    delete from public.cash_sessions where opened_by = v_user_id;
  end if;

  if pg_temp.kwetuu_has_table('team_invites') then
    delete from public.team_invites
    where created_by = v_user_id
       or (pg_temp.kwetuu_has_column('team_invites', 'accepted_by')
           and accepted_by = v_user_id);
  end if;

  if pg_temp.kwetuu_has_table('businesses') and pg_temp.kwetuu_has_table('business_members') then
    delete from public.businesses b
    where b.id in (
      select m.business_id
      from public.business_members m
      where m.user_id = v_user_id and m.role = 'owner' and m.is_active
    );

    delete from public.businesses where created_by = v_user_id;
  end if;

  if pg_temp.kwetuu_has_table('business_members') then
    delete from public.business_members where user_id = v_user_id;
    if pg_temp.kwetuu_has_column('business_members', 'invited_by') then
      update public.business_members set invited_by = null where invited_by = v_user_id;
    end if;
  end if;

  if pg_temp.kwetuu_has_table('inventory_movements')
     and pg_temp.kwetuu_has_column('inventory_movements', 'created_by') then
    update public.inventory_movements set created_by = null where created_by = v_user_id;
  end if;
  if pg_temp.kwetuu_has_table('sales') and pg_temp.kwetuu_has_column('sales', 'created_by') then
    update public.sales set created_by = null where created_by = v_user_id;
  end if;
  if pg_temp.kwetuu_has_table('invoices') and pg_temp.kwetuu_has_column('invoices', 'created_by') then
    update public.invoices set created_by = null where created_by = v_user_id;
  end if;
  if pg_temp.kwetuu_has_table('quotes') and pg_temp.kwetuu_has_column('quotes', 'created_by') then
    update public.quotes set created_by = null where created_by = v_user_id;
  end if;
  if pg_temp.kwetuu_has_table('payments') and pg_temp.kwetuu_has_column('payments', 'created_by') then
    update public.payments set created_by = null where created_by = v_user_id;
  end if;
  if pg_temp.kwetuu_has_table('expenses') and pg_temp.kwetuu_has_column('expenses', 'created_by') then
    update public.expenses set created_by = null where created_by = v_user_id;
  end if;

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

select id, email, created_at from auth.users order by created_at;
