-- Onboarding journey redesign.
-- Adds business_path (management vs full), setup tracking,
-- onboarding configuration (JSONB), and a 1-month Pro trial.

-- ============ BUSINESS PATH & SETUP TRACKING ============

alter table public.businesses
  add column if not exists business_path text not null default 'management'
    check (business_path in ('management', 'full'));

alter table public.businesses
  add column if not exists setup_completed_at timestamptz;

alter table public.businesses
  add column if not exists onboarding_config jsonb not null default '{}'::jsonb;

-- Backfill: every existing business is considered "setup complete"
update public.businesses
  set setup_completed_at = created_at
  where setup_completed_at is null;

-- ============ EXTEND BUSINESS_SETTINGS ============
-- New columns for operational preferences collected during onboarding.

alter table public.business_settings
  add column if not exists payment_methods text[] not null default '{cash}',
  add column if not exists allows_credit boolean not null default false,
  add column if not exists allows_layby boolean not null default false,
  add column if not exists tracks_stock boolean not null default true,
  add column if not exists sells_services boolean not null default false,
  add column if not exists pricing_model text not null default 'retail'
    check (pricing_model in ('retail', 'wholesale', 'both')),
  add column if not exists offers_delivery boolean not null default false,
  add column if not exists offers_collection boolean not null default true;

-- ============ RECREATE create_business_with_owner ============
-- Adds _business_path param, 1-month trial,
-- stores onboarding_config, keeps idempotent return.

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

-- Drop old 5-arg signature grant, add new 7-arg.
revoke all on function public.create_business_with_owner(text, public.business_type, text, text, text, text, jsonb) from public, anon;
grant execute on function public.create_business_with_owner(text, public.business_type, text, text, text, text, jsonb) to authenticated;

-- ============ MARK SETUP COMPLETE ============

create or replace function public.mark_setup_complete(_business_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.business_members
    where business_id = _business_id and user_id = auth.uid() and role = 'owner'
  ) then
    raise exception 'Only the business owner can complete setup.' using errcode = 'B0010';
  end if;

  update public.businesses
  set setup_completed_at = now()
  where id = _business_id and setup_completed_at is null;
end;
$$;

revoke all on function public.mark_setup_complete(uuid) from public, anon;
grant execute on function public.mark_setup_complete(uuid) to authenticated;

-- ============ SAVE ONBOARDING CONFIG ============
-- Allows the onboarding UI to save progress server-side.

create or replace function public.save_onboarding_config(
  _business_id uuid,
  _config jsonb
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.business_members
    where business_id = _business_id and user_id = auth.uid() and role = 'owner'
  ) then
    raise exception 'Only the business owner can update onboarding config.' using errcode = 'B0011';
  end if;

  update public.businesses
  set onboarding_config = _config
  where id = _business_id;
end;
$$;

revoke all on function public.save_onboarding_config(uuid, jsonb) from public, anon;
grant execute on function public.save_onboarding_config(uuid, jsonb) to authenticated;

-- ============ SAVE BUSINESS SETTINGS FROM ONBOARDING ============
-- Applies operational preferences collected during onboarding.

create or replace function public.save_onboarding_settings(
  _business_id uuid,
  _payment_methods text[] default '{cash}',
  _allows_credit boolean default false,
  _allows_layby boolean default false,
  _tracks_stock boolean default true,
  _sells_services boolean default false,
  _pricing_model text default 'retail',
  _offers_delivery boolean default false,
  _offers_collection boolean default true
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.business_members
    where business_id = _business_id and user_id = auth.uid() and role = 'owner'
  ) then
    raise exception 'Only the business owner can update business settings.' using errcode = 'B0012';
  end if;

  update public.business_settings set
    payment_methods = _payment_methods,
    allows_credit = _allows_credit,
    allows_layby = _allows_layby,
    tracks_stock = _tracks_stock,
    sells_services = _sells_services,
    pricing_model = _pricing_model,
    offers_delivery = _offers_delivery,
    offers_collection = _offers_collection,
    updated_at = now()
  where business_id = _business_id;
end;
$$;

revoke all on function public.save_onboarding_settings(uuid, text[], boolean, boolean, boolean, boolean, text, boolean, boolean) from public, anon;
grant execute on function public.save_onboarding_settings(uuid, text[], boolean, boolean, boolean, boolean, text, boolean, boolean) to authenticated;

-- ============ GET SETUP PROGRESS ============
-- Returns live counts for the setup checklist.

create or replace function public.get_setup_progress(_business_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'business_path', b.business_path,
    'setup_completed_at', b.setup_completed_at,
    'has_products', (select count(*) > 0 from public.products where business_id = _business_id),
    'product_count', (select count(*) from public.products where business_id = _business_id),
    'has_sales', (select count(*) > 0 from public.sales where business_id = _business_id),
    'sale_count', (select count(*) from public.sales where business_id = _business_id),
    'storefront_enabled', coalesce(b.storefront_enabled, false),
    'has_customers', (select count(*) > 0 from public.customers where business_id = _business_id),
    'has_team', (
      select count(*) > 1 from public.business_members
      where business_id = _business_id and is_active
    ),
    'onboarding_config', b.onboarding_config
  )
  from public.businesses b
  where b.id = _business_id;
$$;

revoke all on function public.get_setup_progress(uuid) from public, anon;
grant execute on function public.get_setup_progress(uuid) to authenticated;
