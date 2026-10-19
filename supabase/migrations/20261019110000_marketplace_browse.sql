-- Public directory of shops that are already published. Additive.
-- A shop can keep its own /store link and opt out of /market.
-- Does not add a second catalogue, cart, or payment path.
--
-- Rollback before this is used in production:
--   revoke execute on function public.browse_marketplace(text, text, int, int) from anon, authenticated;
--   revoke execute on function public.get_marketplace_listing(uuid) from authenticated;
--   revoke execute on function public.set_marketplace_visible(uuid, boolean) from authenticated;
--   drop function public.browse_marketplace(text, text, int, int);
--   drop function public.get_marketplace_listing(uuid);
--   drop function public.set_marketplace_visible(uuid, boolean);
--   alter table public.storefronts drop column if exists marketplace_visible;
--   restore audit_logs_action_check from 20261019090000_storefront.sql.

alter table public.storefronts
  add column if not exists marketplace_visible boolean not null default true;

create index if not exists storefronts_marketplace_idx
  on public.storefronts (marketplace_visible)
  where status = 'published' and marketplace_visible;

alter table public.audit_logs drop constraint if exists audit_logs_action_check;
alter table public.audit_logs
  add constraint audit_logs_action_check check (
    action in (
      'business.created', 'product.created', 'products.imported',
      'inventory.adjusted', 'customer.created', 'quote.status_changed',
      'expense.created', 'expense.deleted', 'expenses.imported', 'sales.imported',
      'sale.created', 'invoice.created', 'invoice.status_changed',
      'payment.recorded', 'quote.created', 'quote.converted', 'data.exported',
      'supplier.created', 'supplier.updated', 'supplier.deleted',
      'purchase_order.created', 'sales.imported_detailed', 'customers.imported',
      'team.invited', 'team.invite_revoked', 'team.role_changed', 'team.member_removed',
      'team.staff_created', 'team.staff_password_reset', 'team.shop_password_set',
      'team.permission_changed', 'purchase_order.status_changed', 'sale.refunded',
      'recurring_invoice.created', 'team.commission_rate_set',
      'storefront.saved', 'storefront.published', 'storefront.unpublished',
      'storefront.marketplace',
      'store_order.created', 'store_order.updated', 'store_order.paid', 'store_order.cancelled'
    )
  );

create or replace function public.browse_marketplace(
  _query text default null,
  _category text default null,
  _limit int default 24,
  _offset int default 0
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  _q text := replace(replace(left(btrim(coalesce(_query, '')), 80), '%', ''), '_', '');
  _cat text := replace(replace(left(btrim(coalesce(_category, '')), 80), '%', ''), '_', '');
  _shops jsonb;
  _products jsonb;
  _categories jsonb;
  _featured jsonb;
  _recent jsonb;
begin
  if not public.check_rate_limit('marketplace-browse', 180, 60) then
    raise exception 'Too many requests. Please wait a moment and try again.' using errcode = 'B0001';
  end if;
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

create or replace function public.get_marketplace_listing(_business_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  _store public.storefronts;
begin
  if not public.is_business_member(_business_id) then
    raise exception 'Your role does not allow this action.' using errcode = 'B0002';
  end if;
  select * into _store from public.storefronts where business_id = _business_id;
  if not found then
    return jsonb_build_object('listed', false, 'hasStore', false);
  end if;
  return jsonb_build_object('listed', _store.marketplace_visible, 'hasStore', true);
end;
$$;

create or replace function public.set_marketplace_visible(_business_id uuid, _visible boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _store public.storefronts;
begin
  perform public.storefront_require_settings(_business_id);
  select * into _store from public.storefronts where business_id = _business_id;
  if not found then
    raise exception 'Save the shop before choosing whether it appears in the marketplace.' using errcode = 'B0001';
  end if;
  update public.storefronts
    set marketplace_visible = coalesce(_visible, false)
    where business_id = _business_id;
  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary)
  values (
    _business_id,
    auth.uid(),
    'storefront.marketplace',
    'storefront',
    _business_id,
    case when coalesce(_visible, false) then 'Listed the shop in the marketplace' else 'Hid the shop from the marketplace' end
  );
  return public.get_marketplace_listing(_business_id);
end;
$$;

revoke all on function public.browse_marketplace(text, text, int, int) from public;
revoke all on function public.get_marketplace_listing(uuid) from public;
revoke all on function public.set_marketplace_visible(uuid, boolean) from public;
grant execute on function public.browse_marketplace(text, text, int, int) to anon, authenticated;
grant execute on function public.get_marketplace_listing(uuid) to authenticated;
grant execute on function public.set_marketplace_visible(uuid, boolean) to authenticated;
