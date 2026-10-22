-- Additional customer-facing product photos; existing inventory images remain primary.
alter table public.product_listings
  add column if not exists gallery_urls text[] not null default '{}'::text[];

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'product_listings_gallery_urls_limit'
      and conrelid = 'public.product_listings'::regclass
  ) then
    alter table public.product_listings
      add constraint product_listings_gallery_urls_limit
      check (cardinality(gallery_urls) <= 8);
  end if;
end;
$$;

create or replace function public.add_product_listing_media(
  _business_id uuid,
  _product_id uuid,
  _image_url text
) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  _gallery text[];
begin
  if not public.has_business_role(
    _business_id,
    array['owner', 'admin', 'manager']::public.app_role[]
  ) then
    raise exception 'Your role does not allow this action.' using errcode = 'B0002';
  end if;
  if _image_url is null or length(_image_url) > 500 or _image_url !~ '^https://' or
     position(
       '/storage/v1/object/public/product-media/' || _business_id::text || '/' ||
       _product_id::text || '/' in _image_url
     ) = 0 then
    raise exception 'That photo URL is not allowed.' using errcode = 'B0001';
  end if;

  select gallery_urls into _gallery
  from public.product_listings
  where product_id = _product_id and business_id = _business_id
  for update;
  if not found then
    raise exception 'Publish the product to your storefront before adding photos.' using errcode = 'B0001';
  end if;
  if _image_url = any(_gallery) then
    return _gallery;
  end if;
  if cardinality(_gallery) >= 8 then
    raise exception 'A product can have at most eight extra photos.' using errcode = 'B0001';
  end if;
  update public.product_listings
  set gallery_urls = array_append(_gallery, _image_url)
  where product_id = _product_id and business_id = _business_id
  returning gallery_urls into _gallery;
  return _gallery;
end;
$$;

create or replace function public.remove_product_listing_media(
  _business_id uuid,
  _product_id uuid,
  _image_url text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_business_role(
    _business_id,
    array['owner', 'admin', 'manager']::public.app_role[]
  ) then
    raise exception 'Your role does not allow this action.' using errcode = 'B0002';
  end if;
  update public.product_listings
  set gallery_urls = array_remove(gallery_urls, _image_url)
  where product_id = _product_id and business_id = _business_id
    and _image_url = any(gallery_urls);
  if not found then
    raise exception 'That storefront photo could not be found.' using errcode = 'B0001';
  end if;
end;
$$;

create or replace function public.storefront_attach_product_media(
  _products jsonb,
  _business_id uuid
) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    jsonb_agg(
      item || jsonb_build_object(
        'galleryUrls',
        coalesce(media.gallery_urls, '[]'::jsonb)
      ) order by rows.ordinality
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(
    case when jsonb_typeof(_products) = 'array' then _products else '[]'::jsonb end
  ) with ordinality as rows(item, ordinality)
  left join lateral (
    select to_jsonb(listing.gallery_urls) as gallery_urls
    from public.product_listings listing
    where listing.business_id = _business_id
      and listing.product_id::text = rows.item->>'id'
  ) media on true;
$$;

revoke all on function public.add_product_listing_media(uuid, uuid, text) from public, anon;
revoke all on function public.remove_product_listing_media(uuid, uuid, text) from public, anon;
revoke all on function public.storefront_attach_product_media(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.add_product_listing_media(uuid, uuid, text) to authenticated;
grant execute on function public.remove_product_listing_media(uuid, uuid, text) to authenticated;

alter function public.get_storefront_admin(uuid) rename to get_storefront_admin_gallery_base;
alter function public.get_public_store(text, text, text, text, int, int) rename to get_public_store_gallery_base;
alter function public.get_store_preview(text) rename to get_store_preview_gallery_base;

revoke all on function public.get_storefront_admin_gallery_base(uuid) from public, anon, authenticated;
revoke all on function public.get_public_store_gallery_base(text, text, text, text, int, int) from public, anon, authenticated;
revoke all on function public.get_store_preview_gallery_base(text) from public, anon, authenticated;

create or replace function public.get_storefront_admin(_business_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _payload jsonb;
begin
  _payload := public.get_storefront_admin_gallery_base(_business_id);
  if _payload is null then
    return null;
  end if;
  return jsonb_set(
    _payload,
    '{products}',
    public.storefront_attach_product_media(_payload->'products', _business_id),
    true
  );
end;
$$;

create or replace function public.get_public_store(
  _slug text,
  _query text default null,
  _category text default null,
  _sort text default 'featured',
  _limit int default 48,
  _offset int default 0
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
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
    public.storefront_attach_product_media(_payload->'products', _business_id),
    true
  );
end;
$$;

create or replace function public.get_store_preview(_slug text)
returns jsonb
language plpgsql security definer set search_path = public as $$
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
    public.storefront_attach_product_media(_payload->'products', _business_id),
    true
  );
end;
$$;

revoke all on function public.get_storefront_admin(uuid) from public;
revoke all on function public.get_public_store(text, text, text, text, int, int) from public;
revoke all on function public.get_store_preview(text) from public;
grant execute on function public.get_storefront_admin(uuid) to authenticated;
grant execute on function public.get_public_store(text, text, text, text, int, int) to anon, authenticated;
grant execute on function public.get_store_preview(text) to authenticated;
