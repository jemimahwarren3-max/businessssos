-- browse_marketplace_product_management_base was renamed from the original
-- browse_marketplace which was VOLATILE and called check_rate_limit() (an
-- INSERT). When routed to a read replica the INSERT fails with "cannot
-- execute INSERT in a read-only transaction". Remove the rate-limit call
-- and mark the function STABLE so it works on replicas.

create or replace function public.browse_marketplace_product_management_base(
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
  _q text := replace(replace(left(btrim(coalesce(_query, '')), 80), '%', ''), '_', '');
  _cat text := replace(replace(left(btrim(coalesce(_category, '')), 80), '%', ''), '_', '');
  _shops jsonb;
  _products jsonb;
  _categories jsonb;
  _featured jsonb;
  _recent jsonb;
begin
  if _limit is null or _limit < 1 or _limit > 36 then
    _limit := 24;
  end if;
  if _offset is null or _offset < 0 or _offset > 2000 then
    _offset := 0;
  end if;

  with listed as (
    select
      pr.id,
      l.slug,
      pr.name,
      left(coalesce(pr.description, ''), 280) as description,
      pr.selling_price as price,
      b.currency,
      pr.image_url as image_url,
      c.name as category_name,
      l.featured,
      l.created_at,
      s.slug as store_slug,
      s.store_name,
      coalesce(s.tagline, '') as tagline,
      coalesce(s.address, '') as address,
      b.business_type::text as business_type,
      s.logo_url,
      case
        when coalesce(bs.allow_negative_stock, false) or pr.stock > 0 then true
        else false
      end as available,
      case
        when coalesce(bs.allow_negative_stock, false) then 'In stock'
        when pr.stock <= 0 then 'Out of stock'
        when pr.stock <= 10 then 'Only ' || trim(to_char(pr.stock, 'FM999990.###')) || ' left'
        else 'In stock'
      end as stock_label
    from public.storefronts s
    join public.businesses b on b.id = s.business_id
    join public.product_listings l on l.business_id = s.business_id and l.published
    join public.products pr on pr.id = l.product_id
    left join public.categories c on c.id = pr.category_id
    left join public.business_settings bs on bs.business_id = s.business_id
    where s.status = 'published'
      and s.marketplace_visible
      and pr.deleted_at is null
      and pr.is_active
  ),
  matched as (
    select * from listed
    where (
      _q = '' or
      name ilike '%' || _q || '%' or
      description ilike '%' || _q || '%' or
      store_name ilike '%' || _q || '%' or
      tagline ilike '%' || _q || '%' or
      address ilike '%' || _q || '%'
    )
    and (_cat = '' or category_name ilike _cat)
  )
  select
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'slug', shop.store_slug,
        'storeName', shop.store_name,
        'tagline', shop.tagline,
        'businessType', shop.business_type,
        'logoUrl', shop.logo_url,
        'address', shop.address,
        'currency', shop.currency
      ) order by shop.store_name)
      from (
        select
          s.slug as store_slug,
          s.store_name,
          coalesce(s.tagline, '') as tagline,
          b.business_type::text as business_type,
          s.logo_url,
          coalesce(s.address, '') as address,
          b.currency
        from public.storefronts s
        join public.businesses b on b.id = s.business_id
        where s.status = 'published'
          and s.marketplace_visible
          and (
            _q = ''
            or s.store_name ilike '%' || _q || '%'
            or coalesce(s.tagline, '') ilike '%' || _q || '%'
            or coalesce(s.address, '') ilike '%' || _q || '%'
            or exists (
              select 1 from listed item
              where item.store_slug = s.slug
                and (item.name ilike '%' || _q || '%' or item.description ilike '%' || _q || '%')
            )
          )
          and (
            _cat = ''
            or exists (
              select 1 from listed item
              where item.store_slug = s.slug and item.category_name ilike _cat
            )
          )
        order by s.store_name
        limit 24
      ) shop
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.id,
        'slug', item.slug,
        'name', item.name,
        'price', item.price,
        'currency', item.currency,
        'imageUrl', item.image_url,
        'categoryName', item.category_name,
        'stockLabel', item.stock_label,
        'available', item.available,
        'featured', item.featured,
        'storeSlug', item.store_slug,
        'storeName', item.store_name
      ) order by item.featured desc, item.name)
      from (
        select * from matched
        order by featured desc, name
        limit _limit offset _offset
      ) item
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object('name', category_name, 'count', n) order by n desc, category_name)
      from (
        select category_name, count(*)::int as n
        from listed
        where category_name is not null and btrim(category_name) <> ''
        group by category_name
        order by count(*) desc, category_name
        limit 40
      ) cats
    ), '[]'::jsonb),
    case when _q = '' and _cat = '' then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.id,
        'slug', item.slug,
        'name', item.name,
        'price', item.price,
        'currency', item.currency,
        'imageUrl', item.image_url,
        'categoryName', item.category_name,
        'stockLabel', item.stock_label,
        'available', item.available,
        'featured', true,
        'storeSlug', item.store_slug,
        'storeName', item.store_name
      ) order by item.name)
      from (
        select * from listed where featured order by name limit 8
      ) item
    ), '[]'::jsonb) else '[]'::jsonb end,
    case when _q = '' and _cat = '' then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.id,
        'slug', item.slug,
        'name', item.name,
        'price', item.price,
        'currency', item.currency,
        'imageUrl', item.image_url,
        'categoryName', item.category_name,
        'stockLabel', item.stock_label,
        'available', item.available,
        'featured', item.featured,
        'storeSlug', item.store_slug,
        'storeName', item.store_name
      ) order by item.created_at desc)
      from (
        select * from listed order by created_at desc limit 8
      ) item
    ), '[]'::jsonb) else '[]'::jsonb end
  into _shops, _products, _categories, _featured, _recent;

  return jsonb_build_object(
    'query', _q,
    'category', _cat,
    'shops', _shops,
    'products', _products,
    'categories', _categories,
    'featured', _featured,
    'recent', _recent
  );
end;
$$;
