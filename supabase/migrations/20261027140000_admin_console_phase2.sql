-- Platform admin phase 2: tenant detail, email outbox, Paynow controls, public marketing copy.

alter table public.platform_runtime
  add column if not exists marketing_hero_title text,
  add column if not exists marketing_hero_subtitle text;

comment on column public.platform_runtime.marketing_hero_title is
  'Optional override for the public homepage hero title; null uses app defaults.';
comment on column public.platform_runtime.marketing_hero_subtitle is
  'Optional override for the public homepage hero subtitle.';

create or replace function public.get_public_marketing_copy()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'heroTitle', nullif(trim(r.marketing_hero_title), ''),
    'heroSubtitle', nullif(trim(r.marketing_hero_subtitle), '')
  )
  from public.platform_runtime r
  where r.id = 1;
$$;
revoke all on function public.get_public_marketing_copy() from public;
grant execute on function public.get_public_marketing_copy() to anon, authenticated, service_role;

create or replace function public.admin_get_business_detail(_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  _result jsonb;
begin
  if not exists (select 1 from public.businesses b where b.id = _business_id) then
    return null;
  end if;

  select jsonb_build_object(
    'business', (
      select jsonb_build_object(
        'id', b.id,
        'name', b.name,
        'created_at', b.created_at,
        'currency', b.currency,
        'business_type', b.business_type
      )
      from public.businesses b where b.id = _business_id
    ),
    'subscription', (
      select jsonb_build_object(
        'plan', s.plan,
        'status', s.status,
        'trial_ends_at', s.trial_ends_at,
        'current_period_end', s.current_period_end
      )
      from public.subscriptions s where s.business_id = _business_id
    ),
    'storefront', (
      select jsonb_build_object(
        'slug', sf.slug,
        'status', sf.status,
        'store_name', sf.store_name,
        'template_id', sf.template_id,
        'published_at', sf.published_at
      )
      from public.storefronts sf where sf.business_id = _business_id
    ),
    'counts', jsonb_build_object(
      'products', (select count(*) from public.products p where p.business_id = _business_id),
      'store_orders', (select count(*) from public.store_orders o where o.business_id = _business_id),
      'sales', (select count(*) from public.sales sa where sa.business_id = _business_id),
      'members', (select count(*) from public.business_members bm where bm.business_id = _business_id)
    ),
    'members', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', bm.user_id,
          'role', bm.role,
          'email', u.email,
          'notify_email', bm.notify_email
        )
        order by bm.role, u.email
      )
      from public.business_members bm
      join auth.users u on u.id = bm.user_id
      where bm.business_id = _business_id
    ), '[]'::jsonb),
    'recent_orders', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', o.id,
          'reference', o.reference,
          'customer_name', o.customer_name,
          'total', o.total,
          'currency', o.currency,
          'payment_status', o.payment_status,
          'fulfilment_status', o.fulfilment_status,
          'created_at', o.created_at
        )
        order by o.created_at desc
      )
      from (
        select * from public.store_orders
        where business_id = _business_id
        order by created_at desc
        limit 15
      ) o
    ), '[]'::jsonb)
  ) into _result;

  return _result;
end;
$$;
revoke all on function public.admin_get_business_detail(uuid) from public, anon, authenticated;
grant execute on function public.admin_get_business_detail(uuid) to service_role;

create or replace function public.admin_notification_outbox_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'pending', (select count(*) from public.notification_outbox where status = 'pending'),
    'sending', (select count(*) from public.notification_outbox where status = 'sending'),
    'failed', (select count(*) from public.notification_outbox where status = 'failed'),
    'sent_24h', (
      select count(*) from public.notification_outbox
      where status = 'sent' and sent_at > now() - interval '24 hours'
    ),
    'failed_24h', (
      select count(*) from public.notification_outbox
      where status = 'failed' and created_at > now() - interval '24 hours'
    )
  );
$$;
revoke all on function public.admin_notification_outbox_stats() from public, anon, authenticated;
grant execute on function public.admin_notification_outbox_stats() to service_role;

create or replace function public.admin_list_notification_outbox(_limit int default 50, _status text default null)
returns table (
  id uuid,
  business_name text,
  to_email text,
  subject text,
  status text,
  attempts int,
  last_error text,
  created_at timestamptz,
  sent_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id,
    b.name as business_name,
    o.to_email,
    o.subject,
    o.status,
    o.attempts,
    o.last_error,
    o.created_at,
    o.sent_at
  from public.notification_outbox o
  join public.businesses b on b.id = o.business_id
  where _status is null or o.status = _status
  order by o.created_at desc
  limit greatest(1, least(coalesce(_limit, 50), 200));
$$;
revoke all on function public.admin_list_notification_outbox(int, text) from public, anon, authenticated;
grant execute on function public.admin_list_notification_outbox(int, text) to service_role;

create or replace function public.admin_get_payment_provider_controls()
returns setof public.store_payment_provider_controls
language sql
stable
security definer
set search_path = public
as $$
  select * from public.store_payment_provider_controls order by provider;
$$;
revoke all on function public.admin_get_payment_provider_controls() from public, anon, authenticated;
grant execute on function public.admin_get_payment_provider_controls() to service_role;

create or replace function public.admin_set_payment_provider_control(
  _provider text,
  _enabled boolean,
  _live_approved boolean,
  _approval_reference text
)
returns public.store_payment_provider_controls
language plpgsql
security definer
set search_path = public
as $$
declare
  _row public.store_payment_provider_controls;
begin
  update public.store_payment_provider_controls
  set
    enabled = _enabled,
    live_approved = _live_approved,
    approval_reference = nullif(btrim(_approval_reference), ''),
    updated_at = now()
  where provider = _provider
  returning * into _row;

  if _row is null then
    raise exception 'Unknown payment provider %', _provider;
  end if;

  return _row;
end;
$$;
revoke all on function public.admin_set_payment_provider_control(text, boolean, boolean, text) from public, anon, authenticated;
grant execute on function public.admin_set_payment_provider_control(text, boolean, boolean, text) to service_role;

-- Phase 1 columns (safe if 20261027120000 was skipped or not run yet).
alter table public.platform_runtime
  add column if not exists public_announcement text,
  add column if not exists announcement_enabled boolean not null default false;

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
    'marketing_hero_subtitle', coalesce(r.marketing_hero_subtitle, '')
  )
  from public.platform_runtime r
  where r.id = 1;
$$;
revoke all on function public.admin_get_runtime() from public, anon, authenticated;
grant execute on function public.admin_get_runtime() to service_role;
