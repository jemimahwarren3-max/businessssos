alter table public.product_listings
  add column public_name text,
  add constraint product_listings_public_name_check
    check (public_name is null or length(btrim(public_name)) between 1 and 160);

update public.product_listings listing
set published = false
from public.products product
where product.id = listing.product_id
  and product.business_id = listing.business_id
  and listing.published
  and product.selling_price <= 0;

create or replace function public.storefront_require_valid_listing_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.published and not exists (
    select 1
    from public.products product
    where product.id = new.product_id
      and product.business_id = new.business_id
      and product.is_active
      and product.deleted_at is null
      and product.selling_price > 0
  ) then
    raise exception 'Online listings require an active inventory item with a positive selling price.'
      using errcode = 'B0001';
  end if;
  return new;
end;
$$;

revoke all on function public.storefront_require_valid_listing_price() from public, anon, authenticated;

create trigger product_listings_require_valid_price
before insert or update of product_id, business_id, published
on public.product_listings
for each row execute function public.storefront_require_valid_listing_price();

create or replace function public.storefront_prevent_invalid_published_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.selling_price <= 0 and exists (
    select 1
    from public.product_listings listing
    where listing.product_id = new.id
      and listing.business_id = new.business_id
      and listing.published
  ) then
    raise exception 'Unpublish this online product before setting its inventory price to zero.'
      using errcode = 'B0001';
  end if;
  return new;
end;
$$;

revoke all on function public.storefront_prevent_invalid_published_price() from public, anon, authenticated;

create trigger products_require_valid_published_price
before update of selling_price
on public.products
for each row execute function public.storefront_prevent_invalid_published_price();

create or replace function public.set_product_listing_details(
  _business_id uuid,
  _product_id uuid,
  _published boolean,
  _details text,
  _size_guide text,
  _min_qty numeric,
  _max_qty numeric,
  _featured boolean,
  _public_name text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.set_product_listing(
    _business_id,
    _product_id,
    _published,
    _details,
    _size_guide,
    _min_qty,
    _max_qty,
    _featured
  );

  update public.product_listings
  set public_name = nullif(btrim(_public_name), '')
  where business_id = _business_id
    and product_id = _product_id;

  if not found then
    raise exception 'The inventory item could not be listed for this business.'
      using errcode = 'B0001';
  end if;
end;
$$;

revoke all on function public.set_product_listing_details(uuid, uuid, boolean, text, text, numeric, numeric, boolean, text) from public, anon;
grant execute on function public.set_product_listing_details(uuid, uuid, boolean, text, text, numeric, numeric, boolean, text) to authenticated;

create or replace function public.storefront_apply_listing_names(
  _products jsonb,
  _business_id uuid,
  _admin_payload boolean
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      case
        when _admin_payload then entry.item || jsonb_build_object(
          'publicName', listing.public_name,
          'categoryId', product.category_id
        )
        else entry.item || jsonb_build_object(
          'name',
          coalesce(nullif(btrim(listing.public_name), ''), entry.item->>'name'),
          'description',
          coalesce(listing.details, ''),
          'details',
          ''
        )
      end
      order by entry.ordinal
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(coalesce(_products, '[]'::jsonb))
    with ordinality as entry(item, ordinal)
  left join public.product_listings listing
    on listing.business_id = _business_id
    and listing.product_id = (entry.item->>'id')::uuid
  left join public.products product
    on product.business_id = _business_id
    and product.id = (entry.item->>'id')::uuid;
$$;

revoke all on function public.storefront_apply_listing_names(jsonb, uuid, boolean) from public, anon, authenticated;

create or replace function public.get_storefront_admin(_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _payload jsonb;
begin
  _payload := public.get_storefront_admin_gallery_base(_business_id);
  if _payload is null then
    return null;
  end if;
  _payload := jsonb_set(
    _payload,
    '{categories}',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('id', category.id, 'name', category.name)
          order by category.name
        )
        from public.categories category
        where category.business_id = _business_id
      ),
      '[]'::jsonb
    ),
    true
  );
  return jsonb_set(
    _payload,
    '{products}',
    public.storefront_attach_product_media(
      public.storefront_apply_listing_names(_payload->'products', _business_id, true),
      _business_id
    ),
    true
  );
end;
$$;

revoke all on function public.get_storefront_admin(uuid) from public;
grant execute on function public.get_storefront_admin(uuid) to authenticated;

create or replace function public.set_product_category(
  _business_id uuid,
  _product_id uuid,
  _category_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_business_role(
    _business_id,
    array['owner', 'admin', 'manager']::public.app_role[]
  ) then
    raise exception 'Your role does not allow this action.' using errcode = 'B0002';
  end if;
  if not exists (
    select 1
    from public.products product
    where product.id = _product_id
      and product.business_id = _business_id
      and product.deleted_at is null
  ) then
    raise exception 'That inventory item could not be found.' using errcode = 'B0001';
  end if;
  if _category_id is not null and not exists (
    select 1
    from public.categories category
    where category.id = _category_id
      and category.business_id = _business_id
  ) then
    raise exception 'That category does not belong to this business.' using errcode = 'B0001';
  end if;
  update public.products
  set category_id = _category_id
  where id = _product_id and business_id = _business_id and deleted_at is null;
end;
$$;

revoke all on function public.set_product_category(uuid, uuid, uuid) from public, anon;
grant execute on function public.set_product_category(uuid, uuid, uuid) to authenticated;

create or replace function public.get_public_store(
  _slug text,
  _query text default null,
  _category text default null,
  _sort text default 'featured',
  _limit int default 48,
  _offset int default 0
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _payload jsonb;
  _business_id uuid;
begin
  _payload := public.get_public_store_gallery_base(_slug, _query, _category, _sort, _limit, _offset);
  if _payload is null then
    return null;
  end if;
  select business_id into _business_id
  from public.storefronts
  where slug = lower(coalesce(_slug, '')) and status = 'published';
  return jsonb_set(
    _payload,
    '{products}',
    public.storefront_attach_product_media(
      public.storefront_apply_listing_names(_payload->'products', _business_id, false),
      _business_id
    ),
    true
  );
end;
$$;

revoke all on function public.get_public_store(text, text, text, text, int, int) from public;
grant execute on function public.get_public_store(text, text, text, text, int, int) to anon, authenticated;

create or replace function public.get_store_preview(_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _payload jsonb;
  _business_id uuid;
begin
  _payload := public.get_store_preview_gallery_base(_slug);
  if _payload is null then
    return null;
  end if;
  select business_id into _business_id
  from public.storefronts
  where slug = lower(coalesce(_slug, ''));
  return jsonb_set(
    _payload,
    '{products}',
    public.storefront_attach_product_media(
      public.storefront_apply_listing_names(_payload->'products', _business_id, false),
      _business_id
    ),
    true
  );
end;
$$;

revoke all on function public.get_store_preview(text) from public, anon;
grant execute on function public.get_store_preview(text) to authenticated;

alter function public.browse_marketplace(text, text, int, int)
  rename to browse_marketplace_product_management_base;

revoke all on function public.browse_marketplace_product_management_base(text, text, int, int)
  from public, anon, authenticated;

create or replace function public.storefront_apply_marketplace_names(_products jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      entry.item || jsonb_build_object(
        'name',
        coalesce(nullif(btrim(listing.public_name), ''), entry.item->>'name'),
        'description',
        coalesce(listing.details, '')
      )
      order by entry.ordinal
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(coalesce(_products, '[]'::jsonb))
    with ordinality as entry(item, ordinal)
  left join public.storefronts store
    on store.slug = entry.item->>'storeSlug'
  left join public.product_listings listing
    on listing.business_id = store.business_id
    and listing.product_id = (entry.item->>'id')::uuid;
$$;

revoke all on function public.storefront_apply_marketplace_names(jsonb)
  from public, anon, authenticated;

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
