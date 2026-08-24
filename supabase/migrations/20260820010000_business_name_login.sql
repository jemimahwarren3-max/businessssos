-- Step 1 of sign-in switches from a generated business code to the actual
-- business name + shop password — easier to remember, nothing to save at
-- signup. That means business names must be unique platform-wide (checked
-- case-insensitively, trimmed). Confirmed no existing businesses collide
-- before adding this constraint.

create unique index businesses_name_uniq on public.businesses (lower(trim(name)));

create or replace function public.create_business_with_owner(
  _name text,
  _business_type public.business_type,
  _currency text,
  _phone text,
  _address text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_business_id uuid;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'You must be signed in to create a business.' using errcode = 'B0002';
  end if;

  if exists (select 1 from public.businesses where lower(trim(name)) = lower(trim(_name))) then
    raise exception 'That business name is already taken. Please choose another.' using errcode = 'B0001';
  end if;

  insert into public.businesses (
    name, business_type, currency, phone, address, created_by, onboarding_completed
  )
  values (
    _name, _business_type, _currency, nullif(_phone, ''), nullif(_address, ''), v_user_id, true
  )
  returning id into v_business_id;

  insert into public.business_members (business_id, user_id, role, staff_name)
  values (
    v_business_id, v_user_id, 'owner',
    (select raw_user_meta_data->>'full_name' from auth.users where id = v_user_id)
  );

  insert into public.business_settings (business_id) values (v_business_id);

  insert into public.subscriptions (
    business_id, plan, status, trial_ends_at, current_period_start, current_period_end
  )
  values (
    v_business_id, 'pro', 'trialing', now() + interval '3 days', now(), now() + interval '3 days'
  );

  return v_business_id;
end;
$$;
revoke all on function public.create_business_with_owner(text, public.business_type, text, text, text) from public, anon, authenticated;
grant execute on function public.create_business_with_owner(text, public.business_type, text, text, text) to authenticated;

drop function if exists public.resolve_staff_login(text, text);
create or replace function public.resolve_staff_login(_business_name text, _staff_name text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  _business_id uuid;
  _email text;
begin
  select id into _business_id from public.businesses where lower(trim(name)) = lower(trim(_business_name));
  if _business_id is null then
    return null;
  end if;

  select u.email into _email
  from public.business_members m
  join auth.users u on u.id = m.user_id
  where m.business_id = _business_id
    and m.is_active
    and m.staff_name is not null
    and lower(m.staff_name) = lower(_staff_name);

  return _email;
end;
$$;
revoke all on function public.resolve_staff_login(text, text) from public;
grant execute on function public.resolve_staff_login(text, text) to anon, authenticated;

drop function if exists public.verify_shop_login(text, text);
create or replace function public.verify_shop_login(_business_name text, _password text)
returns table(valid boolean, business_id uuid, business_name text, staff_names text[])
language plpgsql security definer set search_path = public as $$
declare
  _biz record;
begin
  select id, name, staff_password_hash into _biz
  from public.businesses where lower(trim(name)) = lower(trim(_business_name));

  if _biz.id is null or _biz.staff_password_hash is null
     or _biz.staff_password_hash <> extensions.crypt(_password, _biz.staff_password_hash) then
    return query select false, null::uuid, null::text, null::text[];
    return;
  end if;

  return query select
    true, _biz.id, _biz.name,
    coalesce(
      (select array_agg(m.staff_name order by m.staff_name)
       from public.business_members m
       where m.business_id = _biz.id and m.is_active and m.staff_name is not null),
      array[]::text[]
    );
end;
$$;
revoke all on function public.verify_shop_login(text, text) from public;
grant execute on function public.verify_shop_login(text, text) to anon, authenticated;
