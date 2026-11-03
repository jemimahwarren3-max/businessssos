-- Pro trial is one calendar month, not 14 days. Production already applied
-- the 14-day onboarding journey body, so replace the RPC and extend
-- in-progress trials. Do not resurrect expired or paid subscriptions.

create or replace function public.create_business_with_owner(
  _name text,
  _business_type public.business_type,
  _currency text,
  _phone text,
  _address text,
  _business_path text default 'management',
  _onboarding_config jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_business_id uuid;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'You must be signed in to create a business.' using errcode = 'B0002';
  end if;

  select bm.business_id into v_business_id
  from public.business_members bm
  where bm.user_id = v_user_id and bm.is_active = true
  order by bm.created_at
  limit 1;
  if v_business_id is not null then
    return v_business_id;
  end if;

  if exists (select 1 from public.businesses where lower(trim(name)) = lower(trim(_name))) then
    raise exception 'That business name is already taken. Please choose another.' using errcode = 'B0001';
  end if;

  if _business_path not in ('management', 'full') then
    _business_path := 'management';
  end if;

  insert into public.businesses (
    name, business_type, currency, phone, address, created_by,
    onboarding_completed, business_path, onboarding_config
  )
  values (
    _name, _business_type, _currency, nullif(_phone, ''), nullif(_address, ''),
    v_user_id, true, _business_path, _onboarding_config
  )
  returning id into v_business_id;

  insert into public.business_members (business_id, user_id, role, staff_name)
  values (
    v_business_id, v_user_id, 'owner',
    (select raw_user_meta_data->>'full_name' from auth.users where id = v_user_id)
  );

  insert into public.business_settings (business_id) values (v_business_id);

  insert into public.locations (business_id, name, is_default, is_active)
  select v_business_id, 'Main', true, true
  where not exists (
    select 1 from public.locations
    where business_id = v_business_id and is_default
  );

  insert into public.subscriptions (
    business_id, plan, status, trial_ends_at, current_period_start, current_period_end
  )
  values (
    v_business_id, 'pro', 'trialing', now() + interval '1 month', now(), now() + interval '1 month'
  );

  return v_business_id;
end;
$$;

revoke all on function public.create_business_with_owner(text, public.business_type, text, text, text, text, jsonb) from public, anon;
grant execute on function public.create_business_with_owner(text, public.business_type, text, text, text, text, jsonb) to authenticated;

update public.subscriptions
set
  trial_ends_at = current_period_start + interval '1 month',
  current_period_end = greatest(
    coalesce(current_period_end, current_period_start + interval '1 month'),
    current_period_start + interval '1 month'
  )
where status = 'trialing'
  and trial_ends_at is not null
  and current_period_start is not null
  and trial_ends_at < current_period_start + interval '1 month';
