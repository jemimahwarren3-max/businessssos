-- Platform admin phase 3: support impersonation (read-only), tenant feature flags, CSV export RPCs.

-- ============ Impersonation sessions ============
create table if not exists public.platform_impersonation_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  reason text not null,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  constraint platform_impersonation_reason_len check (char_length(trim(reason)) >= 3)
);

create index if not exists platform_impersonation_admin_active_idx
  on public.platform_impersonation_sessions (admin_user_id)
  where ended_at is null;

alter table public.platform_impersonation_sessions enable row level security;

-- No direct table access for authenticated users — Node uses service_role RPCs only.
create policy "service role only impersonation"
  on public.platform_impersonation_sessions
  for all
  to service_role
  using (true)
  with check (true);

create or replace function public.is_platform_impersonating(_business_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_impersonation_sessions s
    where s.admin_user_id = auth.uid()
      and s.ended_at is null
      and s.expires_at > now()
      and (_business_id is null or s.business_id = _business_id)
  );
$$;
revoke all on function public.is_platform_impersonating(uuid) from public;
grant execute on function public.is_platform_impersonating(uuid) to authenticated, service_role;

-- Extend read access for RLS SELECT policies (writes still require real membership roles).
create or replace function public.is_business_member(_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.business_members m
    where m.business_id = _business_id
      and m.user_id = auth.uid()
      and m.is_active
  )
  or public.is_platform_impersonating(_business_id);
$$;

create or replace function public.get_my_permissions(_business_id uuid)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  _role public.app_role;
begin
  if public.is_platform_impersonating(_business_id) then
    return (select coalesce(array_agg(key), array[]::text[]) from public.permissions);
  end if;

  select m.role into _role
  from public.business_members m
  where m.business_id = _business_id
    and m.user_id = auth.uid()
    and m.is_active;
  if _role is null then
    raise exception 'You do not have access to this business.' using errcode = 'B0002';
  end if;
  if _role = 'owner' then
    return (select coalesce(array_agg(key), array[]::text[]) from public.permissions);
  end if;
  perform public.seed_default_role_permissions(_business_id);
  return (
    select coalesce(array_agg(permission_key), array[]::text[])
    from public.business_role_permissions
    where business_id = _business_id
      and role = _role
  );
end;
$$;

create or replace function public.my_role(_business_id uuid)
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select m.role
      from public.business_members m
      where m.business_id = _business_id
        and m.user_id = auth.uid()
        and m.is_active
      limit 1
    ),
    case when public.is_platform_impersonating(_business_id) then 'owner'::public.app_role end
  );
$$;

create or replace function public.admin_start_impersonation(
  _admin_user_id uuid,
  _business_id uuid,
  _reason text,
  _ttl_minutes int default 60
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _session_id uuid;
  _ttl int;
begin
  if not exists (select 1 from public.businesses b where b.id = _business_id) then
    raise exception 'Business not found.' using errcode = 'B0001';
  end if;

  _ttl := greatest(5, least(coalesce(_ttl_minutes, 60), 240));

  update public.platform_impersonation_sessions s
  set ended_at = now()
  where s.admin_user_id = _admin_user_id
    and s.ended_at is null;

  insert into public.platform_impersonation_sessions (
    admin_user_id,
    business_id,
    reason,
    expires_at
  )
  values (
    _admin_user_id,
    _business_id,
    trim(_reason),
    now() + (_ttl || ' minutes')::interval
  )
  returning id into _session_id;

  return _session_id;
end;
$$;
revoke all on function public.admin_start_impersonation(uuid, uuid, text, int) from public, anon, authenticated;
grant execute on function public.admin_start_impersonation(uuid, uuid, text, int) to service_role;

create or replace function public.admin_end_impersonation(_admin_user_id uuid, _session_id uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  _count int;
begin
  update public.platform_impersonation_sessions s
  set ended_at = now()
  where s.admin_user_id = _admin_user_id
    and s.ended_at is null
    and (_session_id is null or s.id = _session_id);
  get diagnostics _count = row_count;
  return _count;
end;
$$;
revoke all on function public.admin_end_impersonation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_end_impersonation(uuid, uuid) to service_role;

create or replace function public.admin_get_active_impersonation(_admin_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'sessionId', s.id,
    'businessId', s.business_id,
    'businessName', b.name,
    'reason', s.reason,
    'expiresAt', s.expires_at
  )
  from public.platform_impersonation_sessions s
  join public.businesses b on b.id = s.business_id
  where s.admin_user_id = _admin_user_id
    and s.ended_at is null
    and s.expires_at > now()
  order by s.started_at desc
  limit 1;
$$;
revoke all on function public.admin_get_active_impersonation(uuid) from public, anon, authenticated;
grant execute on function public.admin_get_active_impersonation(uuid) to service_role;

-- ============ Per-tenant feature flags ============
create table if not exists public.business_feature_flags (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  billing_exempt boolean not null default false,
  online_shop_enabled boolean not null default true,
  sms_notifications boolean not null default false,
  courier_manual_mode boolean not null default true,
  notes text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.business_feature_flags enable row level security;

create policy "members read own feature flags"
  on public.business_feature_flags
  for select
  to authenticated
  using (public.is_business_member(business_id));

create policy "service role feature flags"
  on public.business_feature_flags
  for all
  to service_role
  using (true)
  with check (true);

comment on table public.business_feature_flags is
  'Per-tenant toggles for platform operators; enforced in Node and selected RPCs.';

create or replace function public.admin_get_business_feature_flags(_business_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'businessId', _business_id,
    'billingExempt', coalesce(f.billing_exempt, false),
    'onlineShopEnabled', coalesce(f.online_shop_enabled, true),
    'smsNotifications', coalesce(f.sms_notifications, false),
    'courierManualMode', coalesce(f.courier_manual_mode, true),
    'notes', coalesce(f.notes, '')
  )
  from public.businesses b
  left join public.business_feature_flags f on f.business_id = b.id
  where b.id = _business_id;
$$;
revoke all on function public.admin_get_business_feature_flags(uuid) from public, anon, authenticated;
grant execute on function public.admin_get_business_feature_flags(uuid) to service_role;

create or replace function public.admin_set_business_feature_flags(
  _business_id uuid,
  _billing_exempt boolean,
  _online_shop_enabled boolean,
  _sms_notifications boolean,
  _courier_manual_mode boolean,
  _notes text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.businesses b where b.id = _business_id) then
    raise exception 'Business not found.' using errcode = 'B0001';
  end if;

  insert into public.business_feature_flags (
    business_id,
    billing_exempt,
    online_shop_enabled,
    sms_notifications,
    courier_manual_mode,
    notes,
    updated_at
  )
  values (
    _business_id,
    _billing_exempt,
    _online_shop_enabled,
    _sms_notifications,
    _courier_manual_mode,
    nullif(trim(_notes), ''),
    now()
  )
  on conflict (business_id) do update set
    billing_exempt = excluded.billing_exempt,
    online_shop_enabled = excluded.online_shop_enabled,
    sms_notifications = excluded.sms_notifications,
    courier_manual_mode = excluded.courier_manual_mode,
    notes = excluded.notes,
    updated_at = now();

  return public.admin_get_business_feature_flags(_business_id);
end;
$$;
revoke all on function public.admin_set_business_feature_flags(uuid, boolean, boolean, boolean, boolean, text)
  from public, anon, authenticated;
grant execute on function public.admin_set_business_feature_flags(uuid, boolean, boolean, boolean, boolean, text)
  to service_role;

create or replace function public.get_business_feature_flags(_business_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'billingExempt', coalesce(f.billing_exempt, false),
    'onlineShopEnabled', coalesce(f.online_shop_enabled, true),
    'smsNotifications', coalesce(f.sms_notifications, false),
    'courierManualMode', coalesce(f.courier_manual_mode, true)
  )
  from public.businesses b
  left join public.business_feature_flags f on f.business_id = b.id
  where b.id = _business_id
    and (public.is_business_member(_business_id) or auth.role() = 'service_role');
$$;
revoke all on function public.get_business_feature_flags(uuid) from public;
grant execute on function public.get_business_feature_flags(uuid) to authenticated, service_role;

-- ============ CSV export (businesses + subscriptions) ============
create or replace function public.admin_export_tenants_csv()
returns text
language sql
stable
security definer
set search_path = public
as $$
  with rows as (
    select
      b.id::text as business_id,
      replace(replace(coalesce(b.name, ''), '"', '""'), E'\n', ' ') as business_name,
      b.created_at::text as created_at,
      coalesce(b.currency, '') as currency,
      coalesce(s.plan::text, '') as plan,
      coalesce(s.status::text, '') as subscription_status,
      coalesce(s.trial_ends_at::text, '') as trial_ends_at,
      coalesce(s.current_period_end::text, '') as current_period_end,
      coalesce(sf.status, '') as storefront_status,
      coalesce(sf.slug, '') as storefront_slug,
      (select count(*)::text from public.business_members bm where bm.business_id = b.id) as member_count,
      coalesce(f.billing_exempt, false) as billing_exempt,
      coalesce(f.online_shop_enabled, true) as online_shop_enabled
    from public.businesses b
    left join public.subscriptions s on s.business_id = b.id
    left join public.storefronts sf on sf.business_id = b.id
    left join public.business_feature_flags f on f.business_id = b.id
    order by b.created_at desc
  )
  select
    'business_id,business_name,created_at,currency,plan,subscription_status,trial_ends_at,current_period_end,storefront_status,storefront_slug,member_count,billing_exempt,online_shop_enabled'
    || E'\n'
    || coalesce(
      string_agg(
        '"' || business_id || '","' || business_name || '","' || created_at || '","' || currency
        || '","' || plan || '","' || subscription_status || '","' || trial_ends_at || '","'
        || current_period_end || '","' || storefront_status || '","' || storefront_slug || '","'
        || member_count || '","' || billing_exempt || '","' || online_shop_enabled || '"',
        E'\n'
      ),
      ''
    )
  from rows;
$$;
revoke all on function public.admin_export_tenants_csv() from public, anon, authenticated;
grant execute on function public.admin_export_tenants_csv() to service_role;

-- ============ Platform courier / SMS operator notes ============
alter table public.platform_runtime
  add column if not exists courier_ops_notes text,
  add column if not exists sms_ops_notes text;

comment on column public.platform_runtime.courier_ops_notes is
  'Manual courier workflow notes for platform operators (no API integration yet).';
comment on column public.platform_runtime.sms_ops_notes is
  'Manual SMS provider workflow notes for platform operators.';

create or replace function public.admin_get_runtime()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'billing_enforced', coalesce(r.billing_enforced, false),
    'updated_at', r.updated_at,
    'public_announcement', coalesce(r.public_announcement, ''),
    'announcement_enabled', coalesce(r.announcement_enabled, false),
    'marketing_hero_title', coalesce(r.marketing_hero_title, ''),
    'marketing_hero_subtitle', coalesce(r.marketing_hero_subtitle, ''),
    'courier_ops_notes', coalesce(r.courier_ops_notes, ''),
    'sms_ops_notes', coalesce(r.sms_ops_notes, '')
  )
  from public.platform_runtime r
  where r.id = 1;
$$;
revoke all on function public.admin_get_runtime() from public, anon, authenticated;
grant execute on function public.admin_get_runtime() to service_role;
