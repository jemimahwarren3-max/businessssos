alter table public.storefronts
  add column if not exists content jsonb not null default '{}'::jsonb;

alter table public.storefronts
  add constraint storefronts_content_object_check
  check (jsonb_typeof(content) = 'object');

alter function public.get_storefront_admin(uuid) rename to get_storefront_admin_content_base;
alter function public.save_storefront(uuid, jsonb) rename to save_storefront_content_base;
alter function public.get_public_store(text, text, text, text, int, int) rename to get_public_store_content_base;
alter function public.get_store_preview(text) rename to get_store_preview_content_base;

revoke all on function public.get_storefront_admin_content_base(uuid) from public, anon, authenticated;
revoke all on function public.save_storefront_content_base(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.get_public_store_content_base(text, text, text, text, int, int) from public, anon, authenticated;
revoke all on function public.get_store_preview_content_base(text) from public, anon, authenticated;

create or replace function public.storefront_content_json(_raw jsonb)
returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  _collections jsonb;
  _tiles jsonb;
  _faqs jsonb;
begin
  if _raw is null or jsonb_typeof(_raw) <> 'object' then
    return jsonb_build_object(
      'announcement', '', 'collections', '[]'::jsonb, 'promoTiles', '[]'::jsonb,
      'faqs', '[]'::jsonb, 'deliveryPolicy', '', 'returnsPolicy', '', 'privacyPolicy', ''
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', left(coalesce(nullif(item->>'id', ''), 'collection-' || ord::text), 40),
    'title', public.storefront_plain(item->>'title', 80),
    'description', public.storefront_plain(item->>'description', 200),
    'categoryName', public.storefront_plain(item->>'categoryName', 80)
  ) order by ord), '[]'::jsonb)
  into _collections
  from jsonb_array_elements(
    case when jsonb_typeof(_raw->'collections') = 'array' then _raw->'collections' else '[]'::jsonb end
  ) with ordinality as rows(item, ord)
  where ord <= 6 and length(btrim(coalesce(item->>'title', ''))) > 0;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', left(coalesce(nullif(item->>'id', ''), 'promotion-' || ord::text), 40),
    'title', public.storefront_plain(item->>'title', 80),
    'subtitle', public.storefront_plain(item->>'subtitle', 160),
    'imageUrl', coalesce(public.storefront_https(item->>'imageUrl'), ''),
    'categoryName', public.storefront_plain(item->>'categoryName', 80)
  ) order by ord), '[]'::jsonb)
  into _tiles
  from jsonb_array_elements(
    case when jsonb_typeof(_raw->'promoTiles') = 'array' then _raw->'promoTiles' else '[]'::jsonb end
  ) with ordinality as rows(item, ord)
  where ord <= 4 and length(btrim(coalesce(item->>'title', ''))) > 0;

  select coalesce(jsonb_agg(jsonb_build_object(
    'question', public.storefront_plain(item->>'question', 200),
    'answer', public.storefront_plain(item->>'answer', 1000)
  ) order by ord), '[]'::jsonb)
  into _faqs
  from jsonb_array_elements(
    case when jsonb_typeof(_raw->'faqs') = 'array' then _raw->'faqs' else '[]'::jsonb end
  ) with ordinality as rows(item, ord)
  where ord <= 12
    and length(btrim(coalesce(item->>'question', ''))) > 0
    and length(btrim(coalesce(item->>'answer', ''))) > 0;

  return jsonb_build_object(
    'announcement', public.storefront_plain(_raw->>'announcement', 200),
    'collections', _collections,
    'promoTiles', _tiles,
    'faqs', _faqs,
    'deliveryPolicy', public.storefront_plain(_raw->>'deliveryPolicy', 2000),
    'returnsPolicy', public.storefront_plain(_raw->>'returnsPolicy', 2000),
    'privacyPolicy', public.storefront_plain(_raw->>'privacyPolicy', 2000)
  );
end;
$$;

revoke all on function public.storefront_content_json(jsonb) from public, anon, authenticated;

create or replace function public.get_storefront_admin(_business_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _payload jsonb;
  _content jsonb;
begin
  _payload := public.get_storefront_admin_content_base(_business_id);
  if _payload is null or _payload->'store' is null or _payload->'store' = 'null'::jsonb then
    return _payload;
  end if;
  select public.storefront_content_json(s.content) into _content
  from public.storefronts s where s.business_id = _business_id;
  return jsonb_set(_payload, '{store,content}', coalesce(_content, public.storefront_content_json('{}'::jsonb)), true);
end;
$$;

create or replace function public.save_storefront(_business_id uuid, _patch jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _payload jsonb;
  _content jsonb;
  _theme jsonb;
  _sections jsonb;
begin
  if jsonb_typeof(coalesce(_patch->'content', '{}'::jsonb)) <> 'object' then
    raise exception 'Store content must be an object.' using errcode = 'B0001';
  end if;

  _content := public.storefront_content_json(coalesce(_patch->'content', '{}'::jsonb));
  _payload := public.save_storefront_content_base(_business_id, _patch);
  select s.theme into _theme from public.storefronts s where s.business_id = _business_id;
  _sections := coalesce(_theme->'sections', '{}'::jsonb) || jsonb_build_object(
    'announcement', coalesce((_patch->'theme'->'sections'->>'announcement')::boolean, true),
    'collections', coalesce((_patch->'theme'->'sections'->>'collections')::boolean, true),
    'promoTiles', coalesce((_patch->'theme'->'sections'->>'promoTiles')::boolean, true),
    'faqs', coalesce((_patch->'theme'->'sections'->>'faqs')::boolean, true)
  );
  update public.storefronts
  set content = _content,
      theme = jsonb_set(_theme, '{sections}', _sections, true)
  where business_id = _business_id;
  _payload := jsonb_set(_payload, '{store,content}', _content, true);
  return jsonb_set(_payload, '{store,theme,sections}', _sections, true);
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
  _content jsonb;
begin
  _payload := public.get_public_store_content_base(_slug, _query, _category, _sort, _limit, _offset);
  if _payload is null then
    return null;
  end if;
  select public.storefront_content_json(s.content) into _content
  from public.storefronts s
  where s.slug = lower(coalesce(_slug, '')) and s.status = 'published';
  return jsonb_set(_payload, '{content}', coalesce(_content, public.storefront_content_json('{}'::jsonb)), true);
end;
$$;

create or replace function public.get_store_preview(_slug text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _payload jsonb;
  _content jsonb;
begin
  _payload := public.get_store_preview_content_base(_slug);
  if _payload is null then
    return null;
  end if;
  select public.storefront_content_json(s.content) into _content
  from public.storefronts s where s.slug = lower(coalesce(_slug, ''));
  return jsonb_set(_payload, '{content}', coalesce(_content, public.storefront_content_json('{}'::jsonb)), true);
end;
$$;

revoke all on function public.get_storefront_admin(uuid) from public;
revoke all on function public.save_storefront(uuid, jsonb) from public;
revoke all on function public.get_public_store(text, text, text, text, int, int) from public;
revoke all on function public.get_store_preview(text) from public;

grant execute on function public.get_storefront_admin(uuid) to authenticated;
grant execute on function public.save_storefront(uuid, jsonb) to authenticated;
grant execute on function public.get_public_store(text, text, text, text, int, int) to anon, authenticated;
grant execute on function public.get_store_preview(text) to authenticated;
