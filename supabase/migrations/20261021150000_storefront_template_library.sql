alter table public.storefronts
  add column if not exists theme jsonb not null default '{}'::jsonb;

alter table public.storefronts
  drop constraint if exists storefronts_template_check;

alter table public.storefronts
  add constraint storefronts_template_check check (template_id in (
    'beauty', 'beauty-clinic', 'beauty-botanical', 'beauty-editorial', 'beauty-studio', 'beauty-market',
    'fashion-boutique', 'fashion-lookbook', 'fashion-studio', 'fashion-tailored', 'fashion-atelier', 'fashion-archive',
    'electronics-tech', 'electronics-lab', 'electronics-gaming', 'electronics-pro', 'electronics-home', 'electronics-essentials',
    'home', 'home-living', 'home-scandi', 'home-heritage', 'home-gallery', 'home-utility',
    'food', 'grocery', 'food-bakery', 'food-market', 'food-counter', 'food-cafe',
    'luxury', 'jewellery-heirloom', 'jewellery-modern', 'jewellery-gifting', 'jewellery-atelier', 'jewellery-archive',
    'digital', 'wellness-retreat', 'wellness-movement', 'wellness-apothecary', 'wellness-studio', 'wellness-daily',
    'books-reading', 'books-stationery', 'books-gifts', 'books-library', 'books-kids', 'books-creative',
    'sports-performance', 'sports-outdoor', 'sports-team', 'sports-studio', 'sports-recovery', 'sports-essentials',
    'modern-minimal', 'wholesale', 'social', 'general-market', 'general-curated', 'general-essentials'
  ));

update public.storefronts
set theme = jsonb_build_object(
  'primary', coalesce(accent_color, '#1F2937'),
  'accent', coalesce(accent_color, '#1F2937'),
  'background', '#FFFFFF',
  'surface', '#F8FAFC',
  'text', '#171717',
  'button', coalesce(accent_color, '#1F2937'),
  'buttonText', '#FFFFFF',
  'link', '#1D4ED8',
  'fontPair', 'system',
  'coverUrl', '',
  'sections', jsonb_build_object('hero', true, 'categories', true, 'featured', true, 'about', true)
)
where theme = '{}'::jsonb;

alter table public.storefronts
  add constraint storefronts_theme_object_check check (jsonb_typeof(theme) = 'object');

alter function public.get_storefront_admin(uuid) rename to get_storefront_admin_base;
alter function public.save_storefront(uuid, jsonb) rename to save_storefront_base;
alter function public.get_public_store(text, text, text, text, int, int) rename to get_public_store_base;
alter function public.get_store_preview(text) rename to get_store_preview_base;

revoke all on function public.get_storefront_admin_base(uuid) from public, anon, authenticated;
revoke all on function public.save_storefront_base(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.get_public_store_base(text, text, text, text, int, int) from public, anon, authenticated;
revoke all on function public.get_store_preview_base(text) from public, anon, authenticated;

create or replace function public.get_storefront_admin(_business_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _payload jsonb;
  _theme jsonb;
begin
  _payload := public.get_storefront_admin_base(_business_id);
  if _payload is null or _payload->'store' is null or _payload->'store' = 'null'::jsonb then
    return _payload;
  end if;
  select s.theme into _theme from public.storefronts s where s.business_id = _business_id;
  return jsonb_set(_payload, '{store,theme}', coalesce(_theme, '{}'::jsonb), true);
end;
$$;

create or replace function public.save_storefront(_business_id uuid, _patch jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _template text;
  _legacy_patch jsonb;
  _raw_theme jsonb;
  _theme jsonb;
  _accent text;
  _payload jsonb;
begin
  _template := coalesce(_patch->>'templateId', 'modern-minimal');
  if _template not in (
    'beauty', 'beauty-clinic', 'beauty-botanical', 'beauty-editorial', 'beauty-studio', 'beauty-market',
    'fashion-boutique', 'fashion-lookbook', 'fashion-studio', 'fashion-tailored', 'fashion-atelier', 'fashion-archive',
    'electronics-tech', 'electronics-lab', 'electronics-gaming', 'electronics-pro', 'electronics-home', 'electronics-essentials',
    'home', 'home-living', 'home-scandi', 'home-heritage', 'home-gallery', 'home-utility',
    'food', 'grocery', 'food-bakery', 'food-market', 'food-counter', 'food-cafe',
    'luxury', 'jewellery-heirloom', 'jewellery-modern', 'jewellery-gifting', 'jewellery-atelier', 'jewellery-archive',
    'digital', 'wellness-retreat', 'wellness-movement', 'wellness-apothecary', 'wellness-studio', 'wellness-daily',
    'books-reading', 'books-stationery', 'books-gifts', 'books-library', 'books-kids', 'books-creative',
    'sports-performance', 'sports-outdoor', 'sports-team', 'sports-studio', 'sports-recovery', 'sports-essentials',
    'modern-minimal', 'wholesale', 'social', 'general-market', 'general-curated', 'general-essentials'
  ) then
    raise exception 'Choose one of the store designs.' using errcode = 'B0001';
  end if;

  _raw_theme := coalesce(_patch->'theme', '{}'::jsonb);
  if jsonb_typeof(_raw_theme) <> 'object' then
    raise exception 'Store theme settings must be an object.' using errcode = 'B0001';
  end if;
  _accent := coalesce(nullif(btrim(_patch->>'accentColor'), ''), '#1F2937');
  _theme := jsonb_build_object(
    'primary', coalesce(_raw_theme->>'primary', _accent),
    'accent', coalesce(_raw_theme->>'accent', _accent),
    'background', coalesce(_raw_theme->>'background', '#FFFFFF'),
    'surface', coalesce(_raw_theme->>'surface', '#F8FAFC'),
    'text', coalesce(_raw_theme->>'text', '#171717'),
    'button', coalesce(_raw_theme->>'button', _accent),
    'buttonText', coalesce(_raw_theme->>'buttonText', '#FFFFFF'),
    'link', coalesce(_raw_theme->>'link', '#1D4ED8'),
    'fontPair', coalesce(_raw_theme->>'fontPair', 'system'),
    'coverUrl', coalesce(_raw_theme->>'coverUrl', ''),
    'sections', jsonb_build_object(
      'hero', coalesce((_raw_theme->'sections'->>'hero')::boolean, true),
      'categories', coalesce((_raw_theme->'sections'->>'categories')::boolean, true),
      'featured', coalesce((_raw_theme->'sections'->>'featured')::boolean, true),
      'about', coalesce((_raw_theme->'sections'->>'about')::boolean, true)
    )
  );

  if (_theme->>'primary') !~ '^#[0-9A-Fa-f]{6}$'
     or (_theme->>'accent') !~ '^#[0-9A-Fa-f]{6}$'
     or (_theme->>'background') !~ '^#[0-9A-Fa-f]{6}$'
     or (_theme->>'surface') !~ '^#[0-9A-Fa-f]{6}$'
     or (_theme->>'text') !~ '^#[0-9A-Fa-f]{6}$'
     or (_theme->>'button') !~ '^#[0-9A-Fa-f]{6}$'
     or (_theme->>'buttonText') !~ '^#[0-9A-Fa-f]{6}$'
     or (_theme->>'link') !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Theme colors must use six-digit hex values.' using errcode = 'B0001';
  end if;
  if _theme->>'fontPair' not in ('system', 'editorial', 'humanist', 'geometric', 'rounded', 'mono') then
    raise exception 'Choose a supported font pairing.' using errcode = 'B0001';
  end if;
  if length(_theme->>'coverUrl') > 500
     or (_theme->>'coverUrl' <> '' and _theme->>'coverUrl' !~ '^https://') then
    raise exception 'Cover image must use a valid HTTPS URL.' using errcode = 'B0001';
  end if;

  _legacy_patch := jsonb_set(
    _patch,
    '{templateId}',
    to_jsonb(case when _template in (
      'modern-minimal', 'fashion-boutique', 'beauty', 'grocery', 'food',
      'luxury', 'home', 'wholesale', 'social', 'digital'
    ) then _template else 'modern-minimal' end),
    true
  );
  _payload := public.save_storefront_base(_business_id, _legacy_patch);
  update public.storefronts
  set template_id = _template, theme = _theme
  where business_id = _business_id;

  _payload := jsonb_set(_payload, '{store,templateId}', to_jsonb(_template), true);
  return jsonb_set(_payload, '{store,theme}', _theme, true);
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
  _theme jsonb;
begin
  _payload := public.get_public_store_base(_slug, _query, _category, _sort, _limit, _offset);
  if _payload is null then
    return null;
  end if;
  select s.theme into _theme
  from public.storefronts s
  where s.slug = lower(coalesce(_slug, '')) and s.status = 'published';
  return jsonb_set(_payload, '{theme}', coalesce(_theme, '{}'::jsonb), true);
end;
$$;

create or replace function public.get_store_preview(_slug text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _payload jsonb;
  _theme jsonb;
begin
  _payload := public.get_store_preview_base(_slug);
  if _payload is null then
    return null;
  end if;
  select s.theme into _theme
  from public.storefronts s
  where s.slug = lower(coalesce(_slug, ''));
  return jsonb_set(_payload, '{theme}', coalesce(_theme, '{}'::jsonb), true);
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
