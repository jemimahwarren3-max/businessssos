-- Consent-based, first-party storefront measurement and seller marketing drafts.
-- Visitor identifiers are random UUIDs, never IP addresses or device fingerprints.

create table if not exists public.store_marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 100),
  channel text not null check (channel in (
    'whatsapp', 'instagram', 'facebook', 'tiktok', 'google', 'email', 'other'
  )),
  objective text not null check (length(btrim(objective)) between 1 and 240),
  product_id uuid references public.products(id) on delete set null,
  headline text not null check (length(headline) <= 160),
  copy text not null check (length(copy) <= 1200),
  call_to_action text not null check (length(call_to_action) <= 120),
  created_at timestamptz not null default now(),
  unique (business_id, id)
);

create index if not exists store_marketing_campaigns_business_date_idx
  on public.store_marketing_campaigns (business_id, created_at desc);

create table if not exists public.storefront_analytics_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  event_key uuid not null unique,
  visitor_id uuid not null,
  event_type text not null check (event_type in (
    'page_view', 'product_view', 'add_to_cart', 'checkout_start', 'order_placed'
  )),
  source text not null default 'direct' check (source in (
    'direct', 'whatsapp', 'instagram', 'facebook', 'tiktok', 'google', 'email', 'referral', 'other'
  )),
  product_id uuid references public.products(id) on delete set null,
  campaign_id uuid,
  occurred_at timestamptz not null default now(),
  constraint storefront_analytics_campaign_business_fkey
    foreign key (business_id, campaign_id)
    references public.store_marketing_campaigns (business_id, id)
);

create index if not exists storefront_analytics_events_business_date_idx
  on public.storefront_analytics_events (business_id, occurred_at desc);
create index if not exists storefront_analytics_events_visitor_date_idx
  on public.storefront_analytics_events (business_id, visitor_id, occurred_at desc);
create index if not exists storefront_analytics_events_campaign_idx
  on public.storefront_analytics_events (business_id, campaign_id, occurred_at desc)
  where campaign_id is not null;

alter table public.store_orders add column if not exists campaign_id uuid;
alter table public.store_orders add column if not exists analytics_visitor_id uuid;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.store_orders'::regclass
      and conname = 'store_orders_campaign_business_fkey'
  ) then
    alter table public.store_orders
      add constraint store_orders_campaign_business_fkey
      foreign key (business_id, campaign_id)
      references public.store_marketing_campaigns (business_id, id);
  end if;
end $$;
create index if not exists store_orders_campaign_date_idx
  on public.store_orders (business_id, campaign_id, created_at desc)
  where campaign_id is not null;

create table if not exists public.daily_business_briefings (
  business_id uuid not null references public.businesses(id) on delete cascade,
  briefing_date date not null,
  briefing text not null check (length(briefing) between 1 and 1500),
  generated_at timestamptz not null default now(),
  primary key (business_id)
);

alter table public.store_marketing_campaigns enable row level security;
alter table public.storefront_analytics_events enable row level security;
alter table public.daily_business_briefings enable row level security;

grant select, insert, update on public.store_marketing_campaigns to authenticated;
grant all on public.store_marketing_campaigns to service_role;
grant select on public.storefront_analytics_events to authenticated;
grant all on public.storefront_analytics_events to service_role;
grant all on public.daily_business_briefings to service_role;

drop policy if exists "business members read marketing campaigns"
  on public.store_marketing_campaigns;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'store_marketing_campaigns' and policyname = 'authorized members read marketing campaigns') then
    create policy "authorized members read marketing campaigns"
      on public.store_marketing_campaigns for select to authenticated
      using (
        public.is_business_member(business_id)
        and public.has_permission(business_id, 'business.settings')
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'store_marketing_campaigns' and policyname = 'authorized members manage marketing campaigns') then
    create policy "authorized members manage marketing campaigns"
      on public.store_marketing_campaigns for all to authenticated
      using (
        public.is_business_member(business_id)
        and public.has_permission(business_id, 'business.settings')
      )
      with check (
        public.is_business_member(business_id)
        and public.has_permission(business_id, 'business.settings')
        and (product_id is null or exists (
          select 1 from public.products p
          where p.id = store_marketing_campaigns.product_id
            and p.business_id = store_marketing_campaigns.business_id
        ))
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'storefront_analytics_events' and policyname = 'authorized members read storefront analytics') then
    create policy "authorized members read storefront analytics"
      on public.storefront_analytics_events for select to authenticated
      using (
        public.is_business_member(business_id)
        and public.has_permission(business_id, 'reports.financial')
      );
  end if;
end $$;

create or replace function public.record_storefront_analytics_event(
  _slug text,
  _event_key uuid,
  _visitor_id uuid,
  _event_type text,
  _product_slug text default null,
  _campaign_id uuid default null,
  _source text default 'direct'
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  _business_id uuid;
  _product_id uuid;
  _campaign_id_valid uuid;
  _safe_source text;
begin
  if _event_key is null or _visitor_id is null
    or _event_type not in ('page_view', 'product_view', 'add_to_cart', 'checkout_start', 'order_placed') then
    raise exception 'Invalid storefront event.' using errcode = '22023';
  end if;

  select business_id into _business_id
  from public.storefronts
  where slug = lower(coalesce(_slug, '')) and status = 'published';
  if _business_id is null then
    raise exception 'This shop is not available.' using errcode = 'P0002';
  end if;

  _safe_source := case
    when _source in ('direct', 'whatsapp', 'instagram', 'facebook', 'tiktok', 'google', 'email', 'referral') then _source
    else 'other'
  end;

  if _event_type in ('product_view', 'add_to_cart') and _product_slug is not null then
    select pl.product_id into _product_id
    from public.product_listings pl
    where pl.business_id = _business_id
      and pl.slug = _product_slug
      and pl.published;
  end if;

  if _campaign_id is not null and exists (
    select 1 from public.store_marketing_campaigns c
    where c.id = _campaign_id and c.business_id = _business_id
  ) then
    _campaign_id_valid := _campaign_id;
  end if;

  insert into public.storefront_analytics_events (
    business_id, event_key, visitor_id, event_type, source, product_id, campaign_id
  ) values (
    _business_id, _event_key, _visitor_id, _event_type, _safe_source, _product_id, _campaign_id_valid
  ) on conflict (event_key) do nothing;

  return true;
end;
$$;
revoke all on function public.record_storefront_analytics_event(text, uuid, uuid, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.record_storefront_analytics_event(text, uuid, uuid, text, text, uuid, text) to service_role;

create or replace function public.attribute_store_order_analytics(
  _order_id uuid,
  _visitor_id uuid,
  _campaign_id uuid default null
)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  _updated boolean;
begin
  update public.store_orders o
  set analytics_visitor_id = _visitor_id,
      campaign_id = case when exists (
        select 1 from public.store_marketing_campaigns c
        where c.id = _campaign_id and c.business_id = o.business_id
      ) then _campaign_id else null end
  where o.id = _order_id
    and o.analytics_visitor_id is null
    and exists (
      select 1 from public.storefront_analytics_events e
      where e.business_id = o.business_id
        and e.visitor_id = _visitor_id
        and e.event_type = 'page_view'
        and e.occurred_at >= now() - interval '90 days'
    );
  _updated := found;
  return _updated;
end;
$$;
revoke all on function public.attribute_store_order_analytics(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.attribute_store_order_analytics(uuid, uuid, uuid) to service_role;

create or replace function public.cleanup_storefront_analytics()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.check_rate_limit('storefront-analytics-retention-cleanup', 1, 86400) then
    return;
  end if;

  delete from public.storefront_analytics_events
  where occurred_at < now() - interval '180 days';

  update public.store_orders
  set analytics_visitor_id = null
  where created_at < now() - interval '180 days'
    and analytics_visitor_id is not null;
end;
$$;
revoke all on function public.cleanup_storefront_analytics() from public, anon, authenticated;
grant execute on function public.cleanup_storefront_analytics() to service_role;

create or replace function public.get_store_growth_metrics(_business_id uuid, _days integer default 30)
returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  _result jsonb;
  _since timestamptz;
begin
  if auth.uid() is null
    or not public.is_business_member(_business_id)
    or not public.has_permission(_business_id, 'reports.financial') then
    raise exception 'Your role does not allow storefront analytics.' using errcode = '42501';
  end if;
  if _days < 1 or _days > 90 then
    raise exception 'Choose a period between 1 and 90 days.' using errcode = '22023';
  end if;
  _since := now() - make_interval(days => _days);

  with events as materialized (
    select * from public.storefront_analytics_events
    where business_id = _business_id and occurred_at >= _since
  ), visits as (
    select count(distinct visitor_id) as total
    from events where event_type = 'page_view'
  ), paid_orders as (
    select * from public.store_orders
    where business_id = _business_id and created_at >= _since and payment_status = 'paid'
  ), paid as (
    select count(*) as total,
      count(*) filter (where exists (
        select 1 from events e
        where e.visitor_id = paid_orders.analytics_visitor_id and e.event_type = 'page_view'
      )) as tracked_total,
      count(distinct analytics_visitor_id) filter (where exists (
        select 1 from events e
        where e.visitor_id = paid_orders.analytics_visitor_id and e.event_type = 'page_view'
      )) as tracked_visitors
    from paid_orders
  )
  select jsonb_build_object(
    'periodDays', _days,
    'uniqueVisitors', (select total from visits),
    'productViews', (select count(*) from events where event_type = 'product_view'),
    'addToCartVisitors', (select count(distinct visitor_id) from events where event_type = 'add_to_cart'),
    'checkoutVisitors', (select count(distinct visitor_id) from events where event_type = 'checkout_start'),
    'orders', (select count(*) from public.store_orders where business_id = _business_id and created_at >= _since),
    'paidOrders', (select total from paid),
    'trackedPaidOrders', (select tracked_total from paid),
    'trackedPaidVisitors', (select tracked_visitors from paid),
    'conversionRate', case when (select total from visits) = 0 then 0
      else round((select tracked_visitors from paid)::numeric * 100 / (select total from visits), 2) end,
    'paidRevenueByCurrency', coalesce((
      select jsonb_agg(jsonb_build_object('currency', currency, 'amount', amount) order by currency)
      from (
        select currency, sum(total) as amount
        from public.store_orders
        where business_id = _business_id
          and created_at >= _since
          and payment_status = 'paid'
        group by currency
      ) revenue
    ), '[]'::jsonb),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object('source', source, 'visitors', visitors) order by visitors desc)
      from (
        select source, count(distinct visitor_id) as visitors
        from events where event_type = 'page_view'
        group by source
      ) source_counts
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'productId', p.id, 'name', p.name, 'views', p_views.views
      ) order by p_views.views desc)
      from (
        select product_id, count(*) as views
        from events where event_type = 'product_view' and product_id is not null
        group by product_id
        order by count(*) desc
        limit 5
      ) p_views
      join public.products p on p.id = p_views.product_id
    ), '[]'::jsonb),
    'campaigns', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'channel', c.channel,
        'visitors', coalesce(v.visitors, 0),
        'orders', coalesce(o.orders, 0),
        'paidOrders', coalesce(o.paid_orders, 0),
        'paidRevenueByCurrency', coalesce(o.paid_revenue_by_currency, '[]'::jsonb)
      ) order by c.created_at desc)
      from public.store_marketing_campaigns c
      left join (
        select campaign_id, count(distinct visitor_id) as visitors
        from events where event_type = 'page_view' and campaign_id is not null
        group by campaign_id
      ) v on v.campaign_id = c.id
      left join (
        select o.campaign_id, count(*) as orders,
          count(*) filter (where o.payment_status = 'paid') as paid_orders,
          coalesce((
            select jsonb_agg(jsonb_build_object('currency', revenue.currency, 'amount', revenue.amount) order by revenue.currency)
            from (
              select paid_orders.currency, sum(paid_orders.total) as amount
              from public.store_orders paid_orders
              where paid_orders.business_id = _business_id
                and paid_orders.created_at >= _since
                and paid_orders.campaign_id = o.campaign_id
                and paid_orders.payment_status = 'paid'
              group by paid_orders.currency
            ) revenue
          ), '[]'::jsonb) as paid_revenue_by_currency
        from public.store_orders o
        where o.business_id = _business_id and o.created_at >= _since and o.campaign_id is not null
        group by o.campaign_id
      ) o on o.campaign_id = c.id
      where c.business_id = _business_id
    ), '[]'::jsonb)
  ) into _result;

  return _result;
end;
$$;
revoke all on function public.get_store_growth_metrics(uuid, integer) from public, anon;
grant execute on function public.get_store_growth_metrics(uuid, integer) to authenticated;

revoke all on public.daily_business_briefings from public, anon, authenticated;
