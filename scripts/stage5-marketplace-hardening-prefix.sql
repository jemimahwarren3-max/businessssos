-- Stage 5: exclude suspended shops from marketplace discovery and customer checkout.
-- Prerequisite: 20261027180000_store_launch_eligibility.sql (storefronts.suspended_at).

create or replace function public.storefront_require_customer_shop(_slug text)
returns public.storefronts
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _store public.storefronts;
begin
  select * into _store
  from public.storefronts
  where slug = lower(coalesce(_slug, ''))
    and status = 'published'
    and suspended_at is null;
  if not found then
    raise exception 'This shop is not available.' using errcode = 'B0001';
  end if;
  return _store;
end;
$$;

revoke all on function public.storefront_require_customer_shop(text) from public, anon, authenticated;
grant execute on function public.storefront_require_customer_shop(text) to service_role;

create or replace function public.storefront_filter_marketplace_payload(_payload jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _shops jsonb;
  _products jsonb;
  _featured jsonb;
  _recent jsonb;
  _categories jsonb;
begin
  if _payload is null then
    return null;
  end if;

  select coalesce(jsonb_agg(shop order by shop->>'storeName'), '[]'::jsonb)
  into _shops
  from jsonb_array_elements(coalesce(_payload->'shops', '[]'::jsonb)) shop
  join public.storefronts s on s.slug = shop->>'slug'
  where s.status = 'published'
    and s.marketplace_visible
    and s.suspended_at is null;

  select coalesce(jsonb_agg(item order by ord), '[]'::jsonb)
  into _products
  from (
    select item, ord
    from jsonb_array_elements(coalesce(_payload->'products', '[]'::jsonb)) with ordinality as t(item, ord)
    join public.storefronts s on s.slug = item->>'storeSlug'
    where s.status = 'published'
      and s.suspended_at is null
  ) filtered;

  select coalesce(jsonb_agg(item order by ord), '[]'::jsonb)
  into _featured
  from (
    select item, ord
    from jsonb_array_elements(coalesce(_payload->'featured', '[]'::jsonb)) with ordinality as t(item, ord)
    join public.storefronts s on s.slug = item->>'storeSlug'
    where s.status = 'published'
      and s.suspended_at is null
  ) filtered;

  select coalesce(jsonb_agg(item order by ord), '[]'::jsonb)
  into _recent
  from (
    select item, ord
    from jsonb_array_elements(coalesce(_payload->'recent', '[]'::jsonb)) with ordinality as t(item, ord)
    join public.storefronts s on s.slug = item->>'storeSlug'
    where s.status = 'published'
      and s.suspended_at is null
  ) filtered;

  select coalesce(
    (
      select jsonb_agg(jsonb_build_object('name', category_name, 'count', n) order by n desc, category_name)
      from (
        select item->>'categoryName' as category_name, count(*)::int as n
        from jsonb_array_elements(_products) item
        where coalesce(item->>'categoryName', '') <> ''
        group by item->>'categoryName'
        order by count(*) desc, item->>'categoryName'
        limit 40
      ) cats
    ),
    '[]'::jsonb
  )
  into _categories;

  return jsonb_build_object(
    'query', coalesce(_payload->>'query', ''),
    'category', coalesce(_payload->>'category', ''),
    'shops', _shops,
    'products', _products,
    'categories', _categories,
    'featured', _featured,
    'recent', _recent
  );
end;
$$;

revoke all on function public.storefront_filter_marketplace_payload(jsonb) from public, anon, authenticated;
grant execute on function public.storefront_filter_marketplace_payload(jsonb) to service_role;

create or replace function public.browse_marketplace(
  _query text default null,
  _category text default null,
  _limit int default 24,
  _offset int default 0
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _payload jsonb;
begin
  _payload := public.browse_marketplace_product_management_base(_query, _category, _limit, _offset);
  if _payload is null then
    return null;
  end if;
  _payload := public.storefront_filter_marketplace_payload(_payload);
  if _payload is null then
    return null;
  end if;
  _payload := jsonb_set(
    _payload,
    '{products}',
    public.storefront_apply_marketplace_names(_payload->'products'),
    true
  );
  _payload := jsonb_set(
    _payload,
    '{featured}',
    public.storefront_apply_marketplace_names(_payload->'featured'),
    true
  );
  return jsonb_set(
    _payload,
    '{recent}',
    public.storefront_apply_marketplace_names(_payload->'recent'),
    true
  );
end;
$$;

revoke all on function public.browse_marketplace(text, text, int, int) from public;
grant execute on function public.browse_marketplace(text, text, int, int) to anon, authenticated;

create or replace function public.list_public_store_paths()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'slug', s.slug,
      'updatedAt', s.updated_at,
      'products', coalesce((
        select jsonb_agg(l.slug order by l.slug)
        from public.product_listings l
        join public.products pr on pr.id = l.product_id
        where l.business_id = s.business_id and l.published and pr.deleted_at is null and pr.is_active
      ), '[]'::jsonb)
    ))
    from (
      select slug, business_id, updated_at
      from public.storefronts
      where status = 'published'
        and suspended_at is null
      order by updated_at desc
      limit 2000
    ) s
  ), '[]'::jsonb);
end;
$$;

create or replace function public.quote_store_cart(
  _slug text,
  _items jsonb,
  _fulfilment text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _store public.storefronts;
  _priced jsonb;
begin
  if not public.check_rate_limit('store-quote:' || coalesce(_slug, ''), 60, 60) then
    raise exception 'Too many requests. Please wait a moment and try again.' using errcode = 'B0001';
  end if;
  _store := public.storefront_require_customer_shop(_slug);
  if _fulfilment = 'delivery' and coalesce((_store.delivery->>'quoteRequired')::boolean, false) then
    raise exception 'This shop quotes delivery. Request a quote instead of a priced delivery order.' using errcode = 'B0001';
  end if;
  perform public.storefront_assert_fulfilment_clock(_store.delivery, _fulfilment, null, false);
  _priced := public.storefront_price_cart(_store.business_id, _items, _fulfilment, false);
  return jsonb_set(
    _priced,
    '{lines}',
    (
      select coalesce(jsonb_agg(item - 'costPrice'), '[]'::jsonb)
      from jsonb_array_elements(_priced->'lines') item
    )
  );
end;
$$;
