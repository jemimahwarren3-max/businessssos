-- Platform operator console: read-only listings and runtime controls (service_role via Node).

alter table public.platform_runtime
  add column if not exists public_announcement text,
  add column if not exists announcement_enabled boolean not null default false;

comment on column public.platform_runtime.public_announcement is
  'Optional banner copy shown to signed-in merchants when announcement_enabled is true.';
comment on column public.platform_runtime.announcement_enabled is
  'When true, public_announcement is shown in the merchant app shell.';

create or replace function public.get_platform_announcement()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'enabled', coalesce(r.announcement_enabled, false),
    'message', coalesce(nullif(trim(r.public_announcement), ''), '')
  )
  from public.platform_runtime r
  where r.id = 1;
$$;
revoke all on function public.get_platform_announcement() from public;
grant execute on function public.get_platform_announcement() to anon, authenticated, service_role;

create or replace function public.admin_list_businesses(_limit int default 100, _search text default null)
returns table (
  id uuid,
  name text,
  created_at timestamptz,
  plan public.plan_tier,
  subscription_status public.subscription_status,
  storefront_status text,
  storefront_slug text,
  member_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.id,
    b.name,
    b.created_at,
    s.plan,
    s.status as subscription_status,
    sf.status as storefront_status,
    sf.slug as storefront_slug,
    (select count(*) from public.business_members bm where bm.business_id = b.id) as member_count
  from public.businesses b
  left join public.subscriptions s on s.business_id = b.id
  left join public.storefronts sf on sf.business_id = b.id
  where _search is null
    or b.name ilike '%' || _search || '%'
    or sf.slug ilike '%' || _search || '%'
  order by b.created_at desc
  limit greatest(1, least(coalesce(_limit, 100), 500));
$$;
revoke all on function public.admin_list_businesses(int, text) from public, anon, authenticated;
grant execute on function public.admin_list_businesses(int, text) to service_role;

create or replace function public.admin_list_storefronts(_limit int default 100)
returns table (
  business_id uuid,
  business_name text,
  slug text,
  status text,
  store_name text,
  template_id text,
  published_at timestamptz,
  listing_count bigint,
  order_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    sf.business_id,
    b.name as business_name,
    sf.slug,
    sf.status,
    sf.store_name,
    sf.template_id,
    sf.published_at,
    (select count(*) from public.product_listings pl where pl.business_id = sf.business_id and pl.published) as listing_count,
    (select count(*) from public.store_orders o where o.business_id = sf.business_id) as order_count
  from public.storefronts sf
  join public.businesses b on b.id = sf.business_id
  order by sf.updated_at desc nulls last
  limit greatest(1, least(coalesce(_limit, 100), 500));
$$;
revoke all on function public.admin_list_storefronts(int) from public, anon, authenticated;
grant execute on function public.admin_list_storefronts(int) to service_role;

create or replace function public.admin_list_shop_orders(_limit int default 100)
returns table (
  id uuid,
  reference text,
  business_name text,
  customer_name text,
  total numeric,
  currency text,
  payment_status text,
  fulfilment_status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id,
    o.reference,
    b.name as business_name,
    o.customer_name,
    o.total,
    o.currency,
    o.payment_status,
    o.fulfilment_status,
    o.created_at
  from public.store_orders o
  join public.businesses b on b.id = o.business_id
  order by o.created_at desc
  limit greatest(1, least(coalesce(_limit, 100), 500));
$$;
revoke all on function public.admin_list_shop_orders(int) from public, anon, authenticated;
grant execute on function public.admin_list_shop_orders(int) to service_role;

create or replace function public.admin_list_platform_audit(_limit int default 100)
returns table (
  id text,
  source text,
  created_at timestamptz,
  action text,
  reason text,
  business_id uuid,
  detail jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  (
    select
      a.id::text,
      'platform'::text as source,
      a.created_at,
      a.action,
      a.reason,
      null::uuid as business_id,
      a.detail
    from public.platform_admin_audit a
  )
  union all
  (
    select
      l.id::text,
      'subscription'::text as source,
      l.created_at,
      l.action,
      coalesce(l.detail ->> 'reason', l.action) as reason,
      l.business_id,
      l.detail
    from public.admin_audit_log l
  )
  order by created_at desc
  limit greatest(1, least(coalesce(_limit, 100), 500));
$$;
revoke all on function public.admin_list_platform_audit(int) from public, anon, authenticated;
grant execute on function public.admin_list_platform_audit(int) to service_role;

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
    'announcement_enabled', coalesce(r.announcement_enabled, false)
  )
  from public.platform_runtime r
  where r.id = 1;
$$;
revoke all on function public.admin_get_runtime() from public, anon, authenticated;
grant execute on function public.admin_get_runtime() to service_role;
