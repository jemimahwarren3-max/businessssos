-- businessos-staging only. Replace email on line 12, then Run once.

do $$
declare
  v_email text := 'REPLACE_ME@example.com';
  v_user_id uuid;
begin
  select id into v_user_id from auth.users where lower(email) = lower(v_email);
  if v_user_id is null then
    raise exception 'No auth.users row for %', v_email;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'shop_order_payments'
      and column_name = 'confirmed_by'
  ) then
    delete from public.shop_order_payments where confirmed_by = v_user_id;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'cash_movements')
     and exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'cash_sessions') then
    delete from public.cash_movements where session_id in (
      select id from public.cash_sessions where opened_by = v_user_id
    );
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'cash_sessions') then
    delete from public.cash_sessions where opened_by = v_user_id;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'team_invites') then
    delete from public.team_invites where created_by = v_user_id or accepted_by = v_user_id;
  end if;

  delete from public.businesses b
  where b.id in (
    select m.business_id from public.business_members m
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

  raise notice 'Deleted auth user % (%)', v_email, v_user_id;
end $$;
