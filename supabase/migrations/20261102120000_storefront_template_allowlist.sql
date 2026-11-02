-- Live onboarding "Use this template" failed because staging still rejected
-- the 60 website template ids (or relative /marketing cover URLs). Expand the
-- table check, coerce coverUrl to https-or-empty, and wrap save_storefront so
-- food-counter and the other designs persist even if an inner 10-id function
-- is still installed.

alter table public.storefronts drop constraint if exists storefronts_template_check;
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

create or replace function public.storefront_known_template(_template text)
returns text
language plpgsql immutable set search_path = public as $$
begin
  if coalesce(_template, '') not in (
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
  return _template;
end;
$$;

revoke all on function public.storefront_known_template(text) from public, anon, authenticated;

do $$
begin
  if to_regprocedure('public.save_storefront_allowlist_base(uuid, jsonb)') is null
     and to_regprocedure('public.save_storefront(uuid, jsonb)') is not null then
    alter function public.save_storefront(uuid, jsonb) rename to save_storefront_allowlist_base;
  end if;
end $$;

revoke all on function public.save_storefront_allowlist_base(uuid, jsonb) from public, anon, authenticated;

create or replace function public.save_storefront(_business_id uuid, _patch jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _template text;
  _theme jsonb;
  _cover text;
  _inner jsonb;
  _payload jsonb;
begin
  _template := public.storefront_known_template(coalesce(_patch->>'templateId', 'modern-minimal'));
  _theme := coalesce(_patch->'theme', '{}'::jsonb);
  if jsonb_typeof(_theme) = 'object' then
    _cover := coalesce(_theme->>'coverUrl', '');
    if _cover <> '' and _cover !~ '^https://' then
      _theme := jsonb_set(_theme, '{coverUrl}', to_jsonb(''::text), true);
    end if;
    _patch := jsonb_set(_patch, '{theme}', _theme, true);
  end if;

  -- Inner save_storefront may still be the original 10-id function. Remap for
  -- that call, then write the real 60-id template onto the row.
  _inner := jsonb_set(
    _patch,
    '{templateId}',
    to_jsonb(case when _template in (
      'modern-minimal', 'fashion-boutique', 'beauty', 'grocery', 'food',
      'luxury', 'home', 'wholesale', 'social', 'digital'
    ) then _template else 'modern-minimal' end),
    true
  );
  _payload := public.save_storefront_allowlist_base(_business_id, _inner);

  update public.storefronts
  set template_id = _template
  where business_id = _business_id;

  if to_regclass('public.storefronts') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'storefronts' and column_name = 'theme'
     )
     and jsonb_typeof(_theme) = 'object' then
    update public.storefronts
    set theme = jsonb_set(coalesce(theme, '{}'::jsonb), '{coverUrl}', to_jsonb(coalesce(_theme->>'coverUrl', '')), true)
    where business_id = _business_id;
  end if;

  if _payload is not null then
    _payload := jsonb_set(_payload, '{store,templateId}', to_jsonb(_template), true);
  end if;
  return _payload;
end;
$$;

revoke all on function public.save_storefront(uuid, jsonb) from public;
grant execute on function public.save_storefront(uuid, jsonb) to authenticated;
