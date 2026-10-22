-- Online storefront. Additive only: nothing here drops or rewrites POS,
-- inventory, or subscription billing. Rollback notes are at the bottom.
--
-- Stock policy: a normal online order reserves stock immediately (row lock,
-- stock decrement, inventory_movements row with reference_type
-- 'store_order'). It does NOT insert into sales or payments, so it is not
-- revenue. Recording payment later inserts one sales row (channel = 'online')
-- without touching stock again. Cancelling before that sale exists puts the
-- reserved units back. Quote requests do not reserve stock until accepted.
--
-- Paynow is intentionally not charged from this migration. The platform
-- Paynow keys bill BusinessOS subscriptions only. Customer payments are
-- pay on pickup, pay on delivery, or a quote request until a merchant has
-- their own approved gateway account.

alter table public.sales add column if not exists channel text not null default 'pos';
alter table public.sales drop constraint if exists sales_channel_check;
alter table public.sales add constraint sales_channel_check check (channel in ('pos', 'online'));

alter table public.business_counters
  add column if not exists store_order_seq integer not null default 0;

-- Members could previously read staff_password_hash via SELECT * on
-- businesses (RLS is row-level, not column-level). The hash stays readable
-- to security-definer login functions, which run as the table owner.
revoke select (staff_password_hash) on table public.businesses from authenticated, anon;

create table public.storefronts (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  slug text not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  template_id text not null default 'modern-minimal',
  store_name text not null,
  tagline text,
  about text,
  whatsapp text,
  email text,
  phone text,
  address text,
  logo_url text,
  accent_color text,
  hero_title text,
  hero_subtitle text,
  policies text,
  hours text,
  socials jsonb not null default '{}'::jsonb,
  delivery jsonb not null default '{}'::jsonb,
  payments jsonb not null default '{}'::jsonb,
  previewed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint storefronts_slug_format check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'),
  constraint storefronts_template_check check (template_id in (
    'modern-minimal', 'fashion-boutique', 'beauty', 'grocery', 'food',
    'luxury', 'home', 'wholesale', 'social', 'digital'
  )),
  constraint storefronts_accent_check check (
    accent_color is null or accent_color ~ '^#[0-9A-Fa-f]{6}$'
  )
);
create unique index storefronts_slug_uniq on public.storefronts (slug);
create trigger storefronts_updated before update on public.storefronts
  for each row execute function public.set_updated_at();

create table public.product_listings (
  product_id uuid primary key references public.products(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  published boolean not null default false,
  slug text not null,
  details text,
  size_guide text,
  min_qty numeric(14,3) not null default 1 check (min_qty > 0),
  max_qty numeric(14,3),
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_listings_qty_check check (max_qty is null or max_qty >= min_qty),
  unique (business_id, slug)
);
create index product_listings_business_idx on public.product_listings (business_id, published);
create trigger product_listings_updated before update on public.product_listings
  for each row execute function public.set_updated_at();

create table public.store_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  reference text not null,
  idempotency_key text,
  fulfilment_status text not null check (fulfilment_status in (
    'awaiting_confirmation', 'confirmed', 'preparing', 'ready',
    'out_for_delivery', 'completed', 'cancelled'
  )),
  payment_status text not null check (payment_status in (
    'unpaid', 'pending', 'paid', 'failed', 'cancelled', 'expired', 'refunded'
  )),
  payment_method text not null check (payment_method in (
    'pay_on_pickup', 'pay_on_delivery', 'quote'
  )),
  fulfilment_method text not null check (fulfilment_method in ('pickup', 'delivery', 'quote')),
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  customer_address text,
  customer_notes text,
  subtotal numeric(14,2) not null check (subtotal >= 0),
  tax numeric(14,2) not null check (tax >= 0),
  delivery_fee numeric(14,2) not null check (delivery_fee >= 0),
  total numeric(14,2) not null check (total >= 0),
  currency text not null,
  stock_reserved boolean not null default false,
  token_hash text not null,
  sale_id uuid references public.sales(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, reference)
);
create unique index store_orders_idempotency_uniq
  on public.store_orders (business_id, idempotency_key)
  where idempotency_key is not null;
create index store_orders_business_date_idx on public.store_orders (business_id, created_at desc);
create trigger store_orders_updated before update on public.store_orders
  for each row execute function public.set_updated_at();

create table public.store_order_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_id uuid not null references public.store_orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  cost_price numeric(14,2) not null default 0 check (cost_price >= 0),
  tax numeric(14,2) not null default 0 check (tax >= 0),
  line_total numeric(14,2) not null check (line_total >= 0),
  note text
);
create index store_order_items_order_idx on public.store_order_items (order_id);

create table public.store_order_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_id uuid not null references public.store_orders(id) on delete cascade,
  event_type text not null,
  message text not null,
  created_at timestamptz not null default now()
);
create index store_order_events_order_idx on public.store_order_events (order_id, created_at);

grant select on public.storefronts to authenticated;
grant select on public.product_listings to authenticated;
grant select on public.store_orders to authenticated;
grant select on public.store_order_items to authenticated;
grant select on public.store_order_events to authenticated;
grant all on public.storefronts to service_role;
grant all on public.product_listings to service_role;
grant all on public.store_orders to service_role;
grant all on public.store_order_items to service_role;
grant all on public.store_order_events to service_role;

alter table public.storefronts enable row level security;
alter table public.product_listings enable row level security;
alter table public.store_orders enable row level security;
alter table public.store_order_items enable row level security;
alter table public.store_order_events enable row level security;

create policy "members read storefronts" on public.storefronts
  for select to authenticated using (public.is_business_member(business_id));
create policy "members read product_listings" on public.product_listings
  for select to authenticated using (public.is_business_member(business_id));
create policy "members read store_orders" on public.store_orders
  for select to authenticated using (public.is_business_member(business_id));
create policy "members read store_order_items" on public.store_order_items
  for select to authenticated using (public.is_business_member(business_id));
create policy "members read store_order_events" on public.store_order_events
  for select to authenticated using (public.is_business_member(business_id));

-- ============ helpers ============

create or replace function public.storefront_slugify(_value text)
returns text
language sql immutable as $$
  select left(trim(both '-' from regexp_replace(lower(coalesce(_value, '')), '[^a-z0-9]+', '-', 'g')), 40);
$$;

create or replace function public.storefront_plain(_value text, _max int)
returns text
language sql immutable as $$
  select left(btrim(regexp_replace(coalesce(_value, ''), '<[^>]*>', '', 'g')), _max);
$$;

create or replace function public.storefront_https(_value text)
returns text
language plpgsql immutable as $$
declare
  _clean text;
begin
  _clean := btrim(coalesce(_value, ''));
  if _clean = '' then
    return null;
  end if;
  if _clean !~ '^https://[^[:space:]]{1,480}$' then
    raise exception 'Links must be full https addresses.' using errcode = 'B0001';
  end if;
  return _clean;
end;
$$;

create or replace function public.storefront_reserved_slug(_slug text)
returns boolean
language sql immutable as $$
  select _slug in (
    'admin', 'api', 'auth', 'dashboard', 'store', 'stores', 'settings', 'help',
    'legal', 'health', 'invite', 'staff-login', 'reset-password', 'sitemap',
    'robots', 'assets', 'public', 'login', 'signup', 'billing', 'onboarding',
    'sales', 'inventory', 'invoices', 'quotes', 'customers', 'expenses',
    'reports', 'insights', 'assistant', 'suppliers', 'commission', 'storefront',
    'account', 'checkout', 'cart', 'search', 'order', 'products'
  );
$$;

revoke all on function public.storefront_slugify(text) from public;
revoke all on function public.storefront_plain(text, int) from public;
revoke all on function public.storefront_https(text) from public;
revoke all on function public.storefront_reserved_slug(text) from public;

create or replace function public.storefront_require_settings(_business_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_default_role_permissions(_business_id);
  if not public.has_permission(_business_id, 'business.settings') then
    raise exception 'Your role does not allow this action.' using errcode = 'B0002';
  end if;
end;
$$;

create or replace function public.storefront_require_sales(_business_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_default_role_permissions(_business_id);
  if not public.has_permission(_business_id, 'sales.create') then
    raise exception 'Your role does not allow this action.' using errcode = 'B0002';
  end if;
end;
$$;

create or replace function public.storefront_require_payments(_business_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_default_role_permissions(_business_id);
  if not public.has_permission(_business_id, 'payments.record') then
    raise exception 'Your role does not allow this action.' using errcode = 'B0002';
  end if;
end;
$$;

revoke all on function public.storefront_require_settings(uuid) from public;
revoke all on function public.storefront_require_sales(uuid) from public;
revoke all on function public.storefront_require_payments(uuid) from public;

-- ============ catalogue json (no cost, supplier, or exact high stock) ============

create or replace function public.storefront_public_json(_business_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  _store public.storefronts;
  _biz public.businesses;
  _allow_negative boolean;
  _products jsonb;
  _categories jsonb;
begin
  select * into _store from public.storefronts where business_id = _business_id;
  if not found then
    return null;
  end if;
  select * into _biz from public.businesses where id = _business_id;
  select coalesce(allow_negative_stock, false) into _allow_negative
    from public.business_settings where business_id = _business_id;

  select coalesce(jsonb_agg(row_to_json(p)::jsonb order by p.featured desc, p.name), '[]'::jsonb)
    into _products
  from (
    select
      pr.id,
      l.slug,
      pr.name,
      coalesce(pr.description, '') as description,
      coalesce(l.details, '') as details,
      coalesce(l.size_guide, '') as "sizeGuide",
      pr.image_url as "imageUrl",
      pr.selling_price as price,
      _biz.currency as currency,
      pr.unit,
      pr.tax_rate as "taxRate",
      pr.category_id as "categoryId",
      c.name as "categoryName",
      l.min_qty as "minQty",
      l.max_qty as "maxQty",
      l.featured,
      case
        when coalesce(_allow_negative, false) or pr.stock > 0 then true
        else false
      end as available,
      case
        when coalesce(_allow_negative, false) then 'In stock'
        when pr.stock <= 0 then 'Out of stock'
        when pr.stock <= 10 then 'Only ' || trim(to_char(pr.stock, 'FM999990.###')) || ' left'
        else 'In stock'
      end as "stockLabel",
      case
        when coalesce(_allow_negative, false) then coalesce(l.max_qty, 99)
        else least(pr.stock, coalesce(l.max_qty, pr.stock), 99)
      end as "maxPurchasable"
    from public.product_listings l
    join public.products pr on pr.id = l.product_id
    left join public.categories c on c.id = pr.category_id
    where l.business_id = _business_id
      and l.published
      and pr.deleted_at is null
      and pr.is_active
  ) p;

  select coalesce(jsonb_agg(distinct jsonb_build_object('id', c.id, 'name', c.name)), '[]'::jsonb)
    into _categories
  from public.product_listings l
  join public.products pr on pr.id = l.product_id
  join public.categories c on c.id = pr.category_id
  where l.business_id = _business_id and l.published and pr.deleted_at is null and pr.is_active;

  return jsonb_build_object(
    'slug', _store.slug,
    'status', _store.status,
    'templateId', _store.template_id,
    'storeName', _store.store_name,
    'tagline', coalesce(_store.tagline, ''),
    'about', coalesce(_store.about, ''),
    'whatsapp', coalesce(_store.whatsapp, ''),
    'email', coalesce(_store.email, ''),
    'phone', coalesce(_store.phone, ''),
    'address', coalesce(_store.address, ''),
    'logoUrl', _store.logo_url,
    'accentColor', _store.accent_color,
    'heroTitle', coalesce(_store.hero_title, ''),
    'heroSubtitle', coalesce(_store.hero_subtitle, ''),
    'policies', coalesce(_store.policies, ''),
    'hours', coalesce(_store.hours, ''),
    'socials', _store.socials,
    'currency', _biz.currency,
    'businessType', _biz.business_type,
    'delivery', _store.delivery,
    'payments', _store.payments,
    'categories', coalesce(_categories, '[]'::jsonb),
    'products', coalesce(_products, '[]'::jsonb)
  );
end;
$$;
revoke all on function public.storefront_public_json(uuid) from public;

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
  _store public.storefronts;
  _payload jsonb;
  _products jsonb;
  _filtered jsonb;
begin
  if _limit is null or _limit < 1 or _limit > 48 then
    _limit := 48;
  end if;
  if _offset is null or _offset < 0 or _offset > 5000 then
    _offset := 0;
  end if;
  select * into _store from public.storefronts where slug = lower(coalesce(_slug, ''));
  if not found or _store.status <> 'published' then
    return null;
  end if;
  _payload := public.storefront_public_json(_store.business_id);
  select coalesce(jsonb_agg(s.item order by s.rn), '[]'::jsonb) into _filtered
  from (
    select item, row_number() over (
      order by
        case when _sort = 'price_asc' then (item->>'price')::numeric end asc nulls last,
        case when _sort = 'price_desc' then (item->>'price')::numeric end desc nulls last,
        case when _sort = 'name' then item->>'name' end asc,
        case when coalesce(_sort, 'featured') = 'featured' then case when (item->>'featured')::boolean then 0 else 1 end end asc,
        item->>'name'
    ) as rn
    from jsonb_array_elements(_payload->'products') item
    where (
      _query is null or btrim(_query) = '' or
      item->>'name' ilike '%' || replace(replace(left(btrim(_query), 80), '%', ''), '_', '') || '%' or
      item->>'description' ilike '%' || replace(replace(left(btrim(_query), 80), '%', ''), '_', '') || '%'
    )
    and (
      _category is null or btrim(_category) = '' or item->>'categoryId' = _category
      or (left(coalesce(_category, ''), 5) = 'slug:' and item->>'slug' = substr(_category, 6))
    )
  ) s
  where s.rn > _offset and s.rn <= _offset + _limit;
  _products := _filtered;
  return jsonb_set(_payload, '{products}', coalesce(_products, '[]'::jsonb));
end;
$$;

create or replace function public.get_store_preview(_slug text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _store public.storefronts;
  _payload jsonb;
begin
  select * into _store from public.storefronts where slug = lower(coalesce(_slug, ''));
  if not found then
    return null;
  end if;
  if not public.is_business_member(_store.business_id) then
    raise exception 'Your role does not allow this action.' using errcode = 'B0002';
  end if;
  update public.storefronts set previewed_at = now() where business_id = _store.business_id;
  _payload := public.storefront_public_json(_store.business_id);
  return _payload || jsonb_build_object('preview', true);
end;
$$;

-- ============ pricing shared by cart quote and order create ============

create or replace function public.storefront_price_cart(
  _business_id uuid,
  _items jsonb,
  _fulfilment text,
  _lock boolean
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _store public.storefronts;
  _biz public.businesses;
  _allow_negative boolean;
  _line record;
  _product public.products;
  _listing public.product_listings;
  _qty numeric(14,3);
  _line_subtotal numeric(14,2);
  _line_tax numeric(14,2);
  _subtotal numeric(14,2) := 0;
  _tax numeric(14,2) := 0;
  _fee numeric(14,2);
  _min numeric(14,2);
  _priced jsonb := '[]'::jsonb;
  _count int := 0;
begin
  if _items is null or jsonb_typeof(_items) <> 'array' or jsonb_array_length(_items) = 0 then
    raise exception 'Add at least one product.' using errcode = 'B0001';
  end if;
  if jsonb_array_length(_items) > 50 then
    raise exception 'An order can include at most 50 products.' using errcode = 'B0001';
  end if;
  if _fulfilment not in ('pickup', 'delivery', 'quote') then
    raise exception 'Choose pickup, delivery, or a quote request.' using errcode = 'B0001';
  end if;

  select * into _store from public.storefronts where business_id = _business_id;
  select * into _biz from public.businesses where id = _business_id;
  select coalesce(allow_negative_stock, false) into _allow_negative
    from public.business_settings where business_id = _business_id;

  for _line in
    select product_id, quantity, note
    from (
      select nullif(elem->>'productId', '')::uuid as product_id,
             sum((elem->>'quantity')::numeric) as quantity,
             left(string_agg(nullif(left(btrim(coalesce(elem->>'note', '')), 200), ''), ' · '), 200) as note
      from jsonb_array_elements(_items) elem
      group by 1
    ) s
    where product_id is not null
    order by product_id
  loop
    _count := _count + 1;
    if _lock then
      select * into _product from public.products
        where id = _line.product_id and business_id = _business_id and deleted_at is null
        for update;
    else
      select * into _product from public.products
        where id = _line.product_id and business_id = _business_id and deleted_at is null;
    end if;
    if not found or not _product.is_active then
      raise exception 'One of these products is no longer available.' using errcode = 'B0001';
    end if;
    select * into _listing from public.product_listings
      where product_id = _product.id and business_id = _business_id and published;
    if not found then
      raise exception '% is not available in this shop.', _product.name using errcode = 'B0001';
    end if;

    _qty := _line.quantity;
    if _qty is null or _qty <= 0 or _qty > 10000 then
      raise exception 'Check the quantity for %.', _product.name using errcode = 'B0001';
    end if;
    if _qty < _listing.min_qty then
      raise exception '% needs a minimum of %.', _product.name, _listing.min_qty using errcode = 'B0001';
    end if;
    if _listing.max_qty is not null and _qty > _listing.max_qty then
      raise exception '% allows at most % per order.', _product.name, _listing.max_qty using errcode = 'B0001';
    end if;
    if _fulfilment <> 'quote' and not coalesce(_allow_negative, false) and _product.stock < _qty then
      raise exception 'Not enough stock for %. Only % left.', _product.name, _product.stock using errcode = 'B0001';
    end if;

    _line_subtotal := round(_qty * _product.selling_price, 2);
    _line_tax := round(_line_subtotal * coalesce(_product.tax_rate, 0) / 100, 2);
    _subtotal := _subtotal + _line_subtotal;
    _tax := _tax + _line_tax;
    _priced := _priced || jsonb_build_array(jsonb_build_object(
      'productId', _product.id,
      'name', _product.name,
      'quantity', _qty,
      'unitPrice', _product.selling_price,
      'tax', _line_tax,
      'lineTotal', _line_subtotal + _line_tax,
      'note', _line.note,
      'costPrice', _product.cost_price,
      'slug', _listing.slug
    ));
  end loop;

  if _count = 0 then
    raise exception 'Add at least one product.' using errcode = 'B0001';
  end if;

  _min := coalesce((_store.delivery->>'minimumOrder')::numeric, 0);
  if _subtotal < _min then
    raise exception 'This shop has a minimum order of %.', _min using errcode = 'B0001';
  end if;

  if _fulfilment = 'delivery' and coalesce((_store.delivery->>'deliveryEnabled')::boolean, false) is not true then
    raise exception 'This shop does not offer delivery.' using errcode = 'B0001';
  end if;
  if _fulfilment = 'pickup' and coalesce((_store.delivery->>'pickupEnabled')::boolean, false) is not true then
    raise exception 'This shop does not offer pickup.' using errcode = 'B0001';
  end if;
  if _fulfilment = 'quote' and coalesce((_store.payments->>'quotes')::boolean, false) is not true then
    raise exception 'This shop is not accepting quote requests.' using errcode = 'B0001';
  end if;

  _fee := 0;
  if _fulfilment = 'delivery' then
    _fee := round(coalesce((_store.delivery->>'flatFee')::numeric, 0), 2);
    if _fee < 0 then
      _fee := 0;
    end if;
    if nullif(_store.delivery->>'freeOver', '') is not null
       and _subtotal >= (_store.delivery->>'freeOver')::numeric then
      _fee := 0;
    end if;
  end if;

  return jsonb_build_object(
    'currency', _biz.currency,
    'subtotal', _subtotal,
    'tax', _tax,
    'deliveryFee', _fee,
    'total', _subtotal + _tax + _fee,
    'lines', _priced
  );
end;
$$;
revoke all on function public.storefront_price_cart(uuid, jsonb, text, boolean) from public;

create or replace function public.quote_store_cart(
  _slug text,
  _items jsonb,
  _fulfilment text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _store public.storefronts;
  _priced jsonb;
begin
  if not public.check_rate_limit('store-quote:' || coalesce(_slug, ''), 60, 60) then
    raise exception 'Too many requests. Please wait a moment and try again.' using errcode = 'B0001';
  end if;
  select * into _store from public.storefronts where slug = lower(coalesce(_slug, '')) and status = 'published';
  if not found then
    raise exception 'This shop is not available.' using errcode = 'B0001';
  end if;
  _priced := public.storefront_price_cart(_store.business_id, _items, _fulfilment, false);
  -- Cost is an internal field used only when a sale is created.
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

create or replace function public.create_store_order(
  _slug text,
  _idempotency_key text,
  _customer jsonb,
  _items jsonb,
  _fulfilment text,
  _payment_method text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _store public.storefronts;
  _existing public.store_orders;
  _priced jsonb;
  _line jsonb;
  _order_id uuid;
  _seq int;
  _reference text;
  _token text;
  _name text;
  _phone text;
  _email text;
  _address text;
  _notes text;
  _reserve boolean := true;
  _product_id uuid;
  _qty numeric(14,3);
  _stock_before numeric(14,3);
  _stock_after numeric(14,3);
begin
  if not public.check_rate_limit('store-order:' || coalesce(_slug, ''), 20, 60) then
    raise exception 'Too many orders just now. Please wait a minute and try again.' using errcode = 'B0001';
  end if;
  if _idempotency_key is null or length(btrim(_idempotency_key)) < 8 or length(_idempotency_key) > 80 then
    raise exception 'This checkout could not be started. Refresh the page and try again.' using errcode = 'B0001';
  end if;
  if _payment_method not in ('pay_on_pickup', 'pay_on_delivery', 'quote') then
    raise exception 'That payment method is not available.' using errcode = 'B0001';
  end if;

  select * into _store from public.storefronts where slug = lower(coalesce(_slug, '')) and status = 'published';
  if not found then
    raise exception 'This shop is not available.' using errcode = 'B0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('store-order'), hashtext(_store.business_id::text || ':' || _idempotency_key));

  select * into _existing from public.store_orders
    where business_id = _store.business_id and idempotency_key = _idempotency_key;
  if found then
    return jsonb_build_object(
      'reference', _existing.reference,
      'replayed', true,
      'accessToken', null,
      'fulfilmentStatus', _existing.fulfilment_status,
      'paymentStatus', _existing.payment_status,
      'paymentMethod', _existing.payment_method,
      'total', _existing.total,
      'currency', _existing.currency
    );
  end if;

  if _payment_method = 'quote' then
    _fulfilment := 'quote';
    _reserve := false;
  elsif _payment_method = 'pay_on_pickup' then
    if _fulfilment <> 'pickup' or coalesce((_store.payments->>'payOnPickup')::boolean, false) is not true then
      raise exception 'Pay on pickup is not available for this order.' using errcode = 'B0001';
    end if;
  elsif _payment_method = 'pay_on_delivery' then
    if _fulfilment <> 'delivery' or coalesce((_store.payments->>'payOnDelivery')::boolean, false) is not true then
      raise exception 'Pay on delivery is not available for this order.' using errcode = 'B0001';
    end if;
  end if;

  _name := public.storefront_plain(_customer->>'name', 80);
  _phone := regexp_replace(coalesce(_customer->>'phone', ''), '[^0-9+]', '', 'g');
  _email := nullif(public.storefront_plain(_customer->>'email', 120), '');
  _address := nullif(public.storefront_plain(_customer->>'address', 300), '');
  _notes := nullif(public.storefront_plain(_customer->>'notes', 500), '');
  if _name is null or length(_name) < 2 then
    raise exception 'Enter the name for this order.' using errcode = 'B0001';
  end if;
  if length(regexp_replace(_phone, '\D', '', 'g')) < 7 then
    raise exception 'Enter a phone number the shop can use.' using errcode = 'B0001';
  end if;
  if _email is not null and _email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'That email address does not look right.' using errcode = 'B0001';
  end if;
  if _fulfilment = 'delivery' and _address is null then
    raise exception 'Enter a delivery address.' using errcode = 'B0001';
  end if;

  _priced := public.storefront_price_cart(_store.business_id, _items, _fulfilment, true);
  if (_priced->>'total')::numeric <= 0 then
    raise exception 'This order total must be greater than zero.' using errcode = 'B0001';
  end if;

  insert into public.business_counters (business_id) values (_store.business_id)
    on conflict (business_id) do nothing;
  update public.business_counters set store_order_seq = store_order_seq + 1
    where business_id = _store.business_id returning store_order_seq into _seq;
  _reference := 'ON-' || lpad(_seq::text, 4, '0');
  _token := encode(extensions.gen_random_bytes(18), 'hex');
  _order_id := gen_random_uuid();

  insert into public.store_orders (
    id, business_id, reference, idempotency_key, fulfilment_status, payment_status,
    payment_method, fulfilment_method, customer_name, customer_phone, customer_email,
    customer_address, customer_notes, subtotal, tax, delivery_fee, total, currency,
    stock_reserved, token_hash
  ) values (
    _order_id, _store.business_id, _reference, _idempotency_key, 'awaiting_confirmation', 'unpaid',
    _payment_method, _fulfilment, _name, _phone, _email, _address, _notes,
    (_priced->>'subtotal')::numeric, (_priced->>'tax')::numeric, (_priced->>'deliveryFee')::numeric,
    (_priced->>'total')::numeric, _priced->>'currency', false,
    extensions.crypt(_token, extensions.gen_salt('bf'))
  );

  for _line in select * from jsonb_array_elements(_priced->'lines')
  loop
    insert into public.store_order_items (
      business_id, order_id, product_id, name, quantity, unit_price, cost_price, tax, line_total, note
    ) values (
      _store.business_id, _order_id, (_line->>'productId')::uuid, _line->>'name',
      (_line->>'quantity')::numeric, (_line->>'unitPrice')::numeric, (_line->>'costPrice')::numeric,
      (_line->>'tax')::numeric, (_line->>'lineTotal')::numeric, nullif(_line->>'note', '')
    );

    if _reserve then
      _product_id := (_line->>'productId')::uuid;
      _qty := (_line->>'quantity')::numeric;
      select stock into _stock_before from public.products where id = _product_id for update;
      _stock_after := _stock_before - _qty;
      update public.products set stock = _stock_after where id = _product_id;
      insert into public.inventory_movements (
        business_id, product_id, movement_type, quantity, stock_before, stock_after,
        reason, reference_type, reference_id, created_by
      ) values (
        _store.business_id, _product_id, 'sale', -_qty, _stock_before, _stock_after,
        'Online order ' || _reference, 'store_order', _order_id, null
      );
    end if;
  end loop;

  if _reserve then
    update public.store_orders set stock_reserved = true where id = _order_id;
  end if;

  insert into public.store_order_events (business_id, order_id, event_type, message)
  values (
    _store.business_id, _order_id, 'created',
    case when _payment_method = 'quote'
      then 'Quote request received. This is not a paid order.'
      else 'Order received. Payment has not been recorded yet.'
    end
  );

  insert into public.notifications (business_id, type, title, message, severity, link)
  values (
    _store.business_id, 'store_order',
    case when _payment_method = 'quote' then 'New quote request ' || _reference else 'New online order ' || _reference end,
    _name || ' · ' || (_priced->>'currency') || ' ' || (_priced->>'total'),
    'info', '/storefront'
  );

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary)
  values (
    _store.business_id, null, 'store_order.created', 'store_order', _order_id,
    'Online order ' || _reference
  );

  return jsonb_build_object(
    'reference', _reference,
    'replayed', false,
    'accessToken', _token,
    'fulfilmentStatus', 'awaiting_confirmation',
    'paymentStatus', 'unpaid',
    'paymentMethod', _payment_method,
    'fulfilmentMethod', _fulfilment,
    'total', (_priced->>'total')::numeric,
    'currency', _priced->>'currency',
    'subtotal', (_priced->>'subtotal')::numeric,
    'tax', (_priced->>'tax')::numeric,
    'deliveryFee', (_priced->>'deliveryFee')::numeric
  );
end;
$$;

create or replace function public.get_store_order(
  _slug text,
  _reference text,
  _token text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _store public.storefronts;
  _order public.store_orders;
  _items jsonb;
begin
  if not public.check_rate_limit('store-order-read:' || coalesce(_reference, ''), 30, 60) then
    raise exception 'Too many attempts. Please wait a moment and try again.' using errcode = 'B0001';
  end if;
  select * into _store from public.storefronts where slug = lower(coalesce(_slug, ''));
  if not found then
    raise exception 'That order could not be found.' using errcode = 'B0001';
  end if;
  select * into _order from public.store_orders
    where business_id = _store.business_id and reference = upper(btrim(coalesce(_reference, '')));
  if not found or _token is null or _order.token_hash <> extensions.crypt(_token, _order.token_hash) then
    raise exception 'That order could not be found.' using errcode = 'B0001';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', name, 'quantity', quantity, 'unitPrice', unit_price, 'lineTotal', line_total, 'note', note
  ) order by name), '[]'::jsonb) into _items
  from public.store_order_items where order_id = _order.id;

  return jsonb_build_object(
    'reference', _order.reference,
    'storeName', _store.store_name,
    'fulfilmentStatus', _order.fulfilment_status,
    'paymentStatus', _order.payment_status,
    'paymentMethod', _order.payment_method,
    'fulfilmentMethod', _order.fulfilment_method,
    'customerName', _order.customer_name,
    'customerPhone', _order.customer_phone,
    'customerEmail', _order.customer_email,
    'customerAddress', _order.customer_address,
    'customerNotes', _order.customer_notes,
    'subtotal', _order.subtotal,
    'tax', _order.tax,
    'deliveryFee', _order.delivery_fee,
    'total', _order.total,
    'currency', _order.currency,
    'createdAt', _order.created_at,
    'items', _items,
    'paid', _order.payment_status = 'paid',
    'revenueRecorded', _order.sale_id is not null
  );
end;
$$;

-- ============ merchant ============

create or replace function public.save_storefront(_business_id uuid, _patch jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _existing public.storefronts;
  _slug text;
  _base text;
  _n int := 0;
  _template text;
  _name text;
  _delivery jsonb;
  _payments jsonb;
  _socials jsonb;
  _accent text;
begin
  perform public.storefront_require_settings(_business_id);
  if not exists (select 1 from public.businesses where id = _business_id) then
    raise exception 'That business could not be found.' using errcode = 'B0001';
  end if;

  _name := public.storefront_plain(_patch->>'storeName', 120);
  if _name is null or length(_name) < 2 then
    raise exception 'Enter a shop name.' using errcode = 'B0001';
  end if;
  _template := coalesce(_patch->>'templateId', 'modern-minimal');
  if _template not in (
    'modern-minimal', 'fashion-boutique', 'beauty', 'grocery', 'food',
    'luxury', 'home', 'wholesale', 'social', 'digital'
  ) then
    raise exception 'Choose one of the store designs.' using errcode = 'B0001';
  end if;
  _accent := nullif(btrim(coalesce(_patch->>'accentColor', '')), '');
  if _accent is not null and _accent !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Colour must be a hex value like #4F46E5.' using errcode = 'B0001';
  end if;

  _delivery := jsonb_build_object(
    'pickupEnabled', coalesce((_patch->'delivery'->>'pickupEnabled')::boolean, true),
    'deliveryEnabled', coalesce((_patch->'delivery'->>'deliveryEnabled')::boolean, false),
    'flatFee', greatest(coalesce((_patch->'delivery'->>'flatFee')::numeric, 0), 0),
    'freeOver', case
      when nullif(_patch->'delivery'->>'freeOver', '') is null then null
      else greatest((_patch->'delivery'->>'freeOver')::numeric, 0)
    end,
    'minimumOrder', greatest(coalesce((_patch->'delivery'->>'minimumOrder')::numeric, 0), 0),
    'areas', public.storefront_plain(_patch->'delivery'->>'areas', 300),
    'estimate', public.storefront_plain(_patch->'delivery'->>'estimate', 120)
  );
  _payments := jsonb_build_object(
    'payOnPickup', coalesce((_patch->'payments'->>'payOnPickup')::boolean, true)
      and coalesce((_delivery->>'pickupEnabled')::boolean, false),
    'payOnDelivery', coalesce((_patch->'payments'->>'payOnDelivery')::boolean, false)
      and coalesce((_delivery->>'deliveryEnabled')::boolean, false),
    'quotes', coalesce((_patch->'payments'->>'quotes')::boolean, false),
    'paynow', false
  );
  _socials := jsonb_build_object(
    'instagram', public.storefront_https(_patch->'socials'->>'instagram'),
    'facebook', public.storefront_https(_patch->'socials'->>'facebook'),
    'website', public.storefront_https(_patch->'socials'->>'website'),
    'tiktok', public.storefront_https(_patch->'socials'->>'tiktok')
  );

  select * into _existing from public.storefronts where business_id = _business_id;
  _slug := public.storefront_slugify(coalesce(nullif(_patch->>'slug', ''), _name));
  if _slug is null or length(_slug) < 3 then
    _slug := 'shop';
  end if;
  if public.storefront_reserved_slug(_slug) then
    raise exception 'That shop link is reserved. Choose another.' using errcode = 'B0001';
  end if;
  if _existing.business_id is not null and _existing.status = 'published' and _slug <> _existing.slug then
    raise exception 'Unpublish the shop before changing its link.' using errcode = 'B0001';
  end if;
  _base := _slug;
  while exists (
    select 1 from public.storefronts where slug = _slug and business_id <> _business_id
  ) loop
    _n := _n + 1;
    if _n > 50 then
      raise exception 'That shop link is already in use.' using errcode = 'B0001';
    end if;
    _slug := left(_base, 36) || '-' || _n;
  end loop;

  insert into public.storefronts (
    business_id, slug, template_id, store_name, tagline, about, whatsapp, email, phone,
    address, logo_url, accent_color, hero_title, hero_subtitle, policies, hours,
    socials, delivery, payments
  ) values (
    _business_id, _slug, _template, _name,
    nullif(public.storefront_plain(_patch->>'tagline', 160), ''),
    nullif(public.storefront_plain(_patch->>'about', 2000), ''),
    nullif(regexp_replace(coalesce(_patch->>'whatsapp', ''), '[^0-9+]', '', 'g'), ''),
    nullif(public.storefront_plain(_patch->>'email', 120), ''),
    nullif(public.storefront_plain(_patch->>'phone', 40), ''),
    nullif(public.storefront_plain(_patch->>'address', 300), ''),
    public.storefront_https(_patch->>'logoUrl'),
    _accent,
    nullif(public.storefront_plain(_patch->>'heroTitle', 120), ''),
    nullif(public.storefront_plain(_patch->>'heroSubtitle', 200), ''),
    nullif(public.storefront_plain(_patch->>'policies', 4000), ''),
    nullif(public.storefront_plain(_patch->>'hours', 300), ''),
    _socials, _delivery, _payments
  )
  on conflict (business_id) do update set
    slug = excluded.slug,
    template_id = excluded.template_id,
    store_name = excluded.store_name,
    tagline = excluded.tagline,
    about = excluded.about,
    whatsapp = excluded.whatsapp,
    email = excluded.email,
    phone = excluded.phone,
    address = excluded.address,
    logo_url = excluded.logo_url,
    accent_color = excluded.accent_color,
    hero_title = excluded.hero_title,
    hero_subtitle = excluded.hero_subtitle,
    policies = excluded.policies,
    hours = excluded.hours,
    socials = excluded.socials,
    delivery = excluded.delivery,
    payments = excluded.payments;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary)
  values (_business_id, auth.uid(), 'storefront.saved', 'storefront', _business_id, 'Updated online shop settings');

  return public.get_storefront_admin(_business_id);
end;
$$;

create or replace function public.set_product_listing(
  _business_id uuid,
  _product_id uuid,
  _published boolean,
  _details text,
  _size_guide text,
  _min_qty numeric,
  _max_qty numeric,
  _featured boolean
) returns void
language plpgsql security definer set search_path = public as $$
declare
  _product public.products;
  _slug text;
  _base text;
  _n int := 0;
  _existing_slug text;
begin
  perform public.storefront_require_settings(_business_id);
  if _min_qty is null or _min_qty <= 0 or _min_qty > 10000 then
    raise exception 'Minimum quantity must be greater than zero.' using errcode = 'B0001';
  end if;
  if _max_qty is not null and (_max_qty < _min_qty or _max_qty > 10000) then
    raise exception 'Maximum quantity must be at least the minimum.' using errcode = 'B0001';
  end if;
  select * into _product from public.products
    where id = _product_id and business_id = _business_id and deleted_at is null;
  if not found then
    raise exception 'That product could not be found.' using errcode = 'B0001';
  end if;
  select slug into _existing_slug from public.product_listings
    where product_id = _product_id and business_id = _business_id;
  _slug := coalesce(_existing_slug, public.storefront_slugify(_product.name));
  if _slug is null or length(_slug) < 2 then
    _slug := 'item';
  end if;
  _base := _slug;
  while exists (
    select 1 from public.product_listings
    where business_id = _business_id and slug = _slug and product_id <> _product_id
  ) loop
    _n := _n + 1;
    _slug := left(_base, 32) || '-' || left(replace(_product_id::text, '-', ''), 6);
    exit when _n > 3;
  end loop;

  insert into public.product_listings (
    product_id, business_id, published, slug, details, size_guide, min_qty, max_qty, featured
  ) values (
    _product_id, _business_id, coalesce(_published, false), _slug,
    nullif(public.storefront_plain(_details, 2000), ''),
    nullif(public.storefront_plain(_size_guide, 2000), ''),
    _min_qty, _max_qty, coalesce(_featured, false)
  )
  on conflict (product_id) do update set
    published = excluded.published,
    details = excluded.details,
    size_guide = excluded.size_guide,
    min_qty = excluded.min_qty,
    max_qty = excluded.max_qty,
    featured = excluded.featured;
end;
$$;

create or replace function public.set_storefront_published(_business_id uuid, _published boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _store public.storefronts;
  _listed int;
begin
  perform public.storefront_require_settings(_business_id);
  select * into _store from public.storefronts where business_id = _business_id;
  if not found then
    raise exception 'Save the shop details before publishing.' using errcode = 'B0001';
  end if;
  if _published then
    select count(*) into _listed from public.product_listings
      where business_id = _business_id and published;
    if _listed < 1 then
      raise exception 'Publish at least one product before opening the shop.' using errcode = 'B0001';
    end if;
    if coalesce((_store.delivery->>'pickupEnabled')::boolean, false) is not true
       and coalesce((_store.delivery->>'deliveryEnabled')::boolean, false) is not true
       and coalesce((_store.payments->>'quotes')::boolean, false) is not true then
      raise exception 'Turn on pickup, delivery, or quote requests before publishing.' using errcode = 'B0001';
    end if;
    if coalesce((_store.payments->>'payOnPickup')::boolean, false) is not true
       and coalesce((_store.payments->>'payOnDelivery')::boolean, false) is not true
       and coalesce((_store.payments->>'quotes')::boolean, false) is not true then
      raise exception 'Turn on a payment method customers can actually use.' using errcode = 'B0001';
    end if;
    update public.storefronts
      set status = 'published', published_at = coalesce(published_at, now())
      where business_id = _business_id;
    insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary)
    values (_business_id, auth.uid(), 'storefront.published', 'storefront', _business_id, 'Published online shop');
  else
    update public.storefronts set status = 'draft' where business_id = _business_id;
    insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary)
    values (_business_id, auth.uid(), 'storefront.unpublished', 'storefront', _business_id, 'Unpublished online shop');
  end if;
  return public.get_storefront_admin(_business_id);
end;
$$;

create or replace function public.get_storefront_admin(_business_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _store public.storefronts;
  _biz public.businesses;
  _products jsonb;
  _orders jsonb;
  _listed int := 0;
  _open int := 0;
  _unpaid int := 0;
  _out int := 0;
  _low int := 0;
begin
  if not public.is_business_member(_business_id) then
    raise exception 'You do not have access to this business.' using errcode = 'B0002';
  end if;
  select * into _biz from public.businesses where id = _business_id;
  select * into _store from public.storefronts where business_id = _business_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pr.id,
    'name', pr.name,
    'sku', pr.sku,
    'price', pr.selling_price,
    'stock', pr.stock,
    'unit', pr.unit,
    'imageUrl', pr.image_url,
    'categoryName', c.name,
    'published', coalesce(l.published, false),
    'slug', l.slug,
    'featured', coalesce(l.featured, false),
    'minQty', coalesce(l.min_qty, 1),
    'maxQty', l.max_qty,
    'details', coalesce(l.details, ''),
    'sizeGuide', coalesce(l.size_guide, '')
  ) order by pr.name), '[]'::jsonb)
  into _products
  from public.products pr
  left join public.product_listings l on l.product_id = pr.id
  left join public.categories c on c.id = pr.category_id
  where pr.business_id = _business_id and pr.deleted_at is null and pr.is_active;

  if _store.business_id is not null then
    select count(*) into _listed from public.product_listings
      where business_id = _business_id and published;
    select count(*) into _open from public.store_orders
      where business_id = _business_id and fulfilment_status not in ('completed', 'cancelled');
    select count(*) into _unpaid from public.store_orders
      where business_id = _business_id and payment_status = 'unpaid' and fulfilment_status <> 'cancelled';
    select count(*) into _out from public.product_listings l
      join public.products pr on pr.id = l.product_id
      where l.business_id = _business_id and l.published and pr.stock <= 0;
    select count(*) into _low from public.product_listings l
      join public.products pr on pr.id = l.product_id
      where l.business_id = _business_id and l.published and pr.stock > 0
        and pr.stock <= greatest(pr.min_stock, 5);
  end if;

  select coalesce(jsonb_agg(row_to_json(o)::jsonb), '[]'::jsonb) into _orders
  from (
    select
      so.id,
      so.reference,
      so.created_at as "createdAt",
      so.customer_name as "customerName",
      so.customer_phone as "customerPhone",
      so.total,
      so.currency,
      so.payment_status as "paymentStatus",
      so.fulfilment_status as "fulfilmentStatus",
      so.payment_method as "paymentMethod",
      so.fulfilment_method as "fulfilmentMethod",
      so.sale_id as "saleId",
      (select count(*) from public.store_order_items i where i.order_id = so.id) as "itemCount"
    from public.store_orders so
    where so.business_id = _business_id
    order by so.created_at desc
    limit 50
  ) o;

  return jsonb_build_object(
    'currency', _biz.currency,
    'store', case when _store.business_id is null then null else jsonb_build_object(
      'slug', _store.slug,
      'status', _store.status,
      'templateId', _store.template_id,
      'storeName', _store.store_name,
      'tagline', coalesce(_store.tagline, ''),
      'about', coalesce(_store.about, ''),
      'whatsapp', coalesce(_store.whatsapp, ''),
      'email', coalesce(_store.email, ''),
      'phone', coalesce(_store.phone, ''),
      'address', coalesce(_store.address, ''),
      'logoUrl', _store.logo_url,
      'accentColor', _store.accent_color,
      'heroTitle', coalesce(_store.hero_title, ''),
      'heroSubtitle', coalesce(_store.hero_subtitle, ''),
      'policies', coalesce(_store.policies, ''),
      'hours', coalesce(_store.hours, ''),
      'socials', _store.socials,
      'delivery', _store.delivery,
      'payments', _store.payments,
      'publishedAt', _store.published_at,
      'previewedAt', _store.previewed_at
    ) end,
    'checklist', jsonb_build_object(
      'name', _store.store_name is not null and coalesce(_store.phone, _store.whatsapp, '') <> '',
      'template', _store.template_id is not null,
      'products', _listed > 0,
      'payments', coalesce((_store.payments->>'payOnPickup')::boolean, false)
        or coalesce((_store.payments->>'payOnDelivery')::boolean, false)
        or coalesce((_store.payments->>'quotes')::boolean, false),
      'fulfilment', coalesce((_store.delivery->>'pickupEnabled')::boolean, false)
        or coalesce((_store.delivery->>'deliveryEnabled')::boolean, false)
        or coalesce((_store.payments->>'quotes')::boolean, false),
      'policies', coalesce(_store.policies, '') <> '',
      'previewed', _store.previewed_at is not null,
      'published', _store.status = 'published'
    ),
    'products', _products,
    'orders', coalesce(_orders, '[]'::jsonb),
    'metrics', jsonb_build_object(
      'openOrders', _open,
      'unpaidOrders', _unpaid,
      'outOfStockPublished', _out,
      'lowStockPublished', _low,
      'publishedProducts', _listed
    )
  );
end;
$$;

create or replace function public.get_store_order_admin(_business_id uuid, _order_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _order public.store_orders;
  _items jsonb;
  _events jsonb;
begin
  if not public.is_business_member(_business_id) then
    raise exception 'You do not have access to this business.' using errcode = 'B0002';
  end if;
  select * into _order from public.store_orders where id = _order_id and business_id = _business_id;
  if not found then
    raise exception 'That order could not be found.' using errcode = 'B0001';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', name, 'quantity', quantity, 'unitPrice', unit_price, 'lineTotal', line_total, 'note', note
  ) order by name), '[]'::jsonb) into _items
  from public.store_order_items where order_id = _order.id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'eventType', event_type, 'message', message, 'createdAt', created_at
  ) order by created_at), '[]'::jsonb) into _events
  from public.store_order_events where order_id = _order.id;

  return jsonb_build_object(
    'id', _order.id,
    'reference', _order.reference,
    'fulfilmentStatus', _order.fulfilment_status,
    'paymentStatus', _order.payment_status,
    'paymentMethod', _order.payment_method,
    'fulfilmentMethod', _order.fulfilment_method,
    'customerName', _order.customer_name,
    'customerPhone', _order.customer_phone,
    'customerEmail', _order.customer_email,
    'customerAddress', _order.customer_address,
    'customerNotes', _order.customer_notes,
    'subtotal', _order.subtotal,
    'tax', _order.tax,
    'deliveryFee', _order.delivery_fee,
    'total', _order.total,
    'currency', _order.currency,
    'saleId', _order.sale_id,
    'stockReserved', _order.stock_reserved,
    'createdAt', _order.created_at,
    'items', _items,
    'events', _events
  );
end;
$$;

create or replace function public.storefront_restore_stock(_order_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  _order public.store_orders;
  _item public.store_order_items;
  _stock_before numeric(14,3);
  _stock_after numeric(14,3);
begin
  select * into _order from public.store_orders where id = _order_id for update;
  if not found or not _order.stock_reserved or _order.sale_id is not null then
    return;
  end if;
  for _item in select * from public.store_order_items where order_id = _order_id order by product_id
  loop
    if _item.product_id is null then
      continue;
    end if;
    select stock into _stock_before from public.products where id = _item.product_id for update;
    if not found then
      continue;
    end if;
    _stock_after := _stock_before + _item.quantity;
    update public.products set stock = _stock_after where id = _item.product_id;
    insert into public.inventory_movements (
      business_id, product_id, movement_type, quantity, stock_before, stock_after,
      reason, reference_type, reference_id, created_by
    ) values (
      _order.business_id, _item.product_id, 'return', _item.quantity, _stock_before, _stock_after,
      'Cancelled online order ' || _order.reference, 'store_order', _order.id, auth.uid()
    );
  end loop;
  update public.store_orders set stock_reserved = false where id = _order_id;
end;
$$;
revoke all on function public.storefront_restore_stock(uuid) from public;

create or replace function public.storefront_record_sale(_order_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _order public.store_orders;
  _item public.store_order_items;
  _sale_id uuid;
  _seq int;
  _number text;
  _method public.payment_method;
  _cost numeric(14,2) := 0;
begin
  select * into _order from public.store_orders where id = _order_id for update;
  if _order.sale_id is not null then
    return _order.sale_id;
  end if;
  _method := case when _order.payment_method = 'quote' then 'cash'::public.payment_method else 'cash'::public.payment_method end;

  insert into public.business_counters (business_id) values (_order.business_id)
    on conflict (business_id) do nothing;
  update public.business_counters set sale_seq = sale_seq + 1
    where business_id = _order.business_id returning sale_seq into _seq;
  _number := 'S-' || lpad(_seq::text, 4, '0');

  insert into public.sales (
    business_id, sale_number, subtotal, discount, tax, total, amount_paid, cost_total,
    payment_method, status, notes, created_by, idempotency_key, channel
  ) values (
    _order.business_id, _number, _order.subtotal, 0, _order.tax, _order.total,
    _order.total, 0, _method, 'completed',
    'Online order ' || _order.reference, auth.uid(), 'store:' || _order.id::text, 'online'
  ) returning id into _sale_id;

  for _item in select * from public.store_order_items where order_id = _order.id
  loop
    _cost := _cost + round(_item.quantity * _item.cost_price, 2);
    insert into public.sale_items (
      business_id, sale_id, product_id, name, quantity, unit_price, cost_price, discount, tax, line_total
    ) values (
      _order.business_id, _sale_id, _item.product_id, _item.name, _item.quantity,
      _item.unit_price, _item.cost_price, 0, _item.tax, _item.line_total
    );
  end loop;

  if _order.delivery_fee > 0 then
    insert into public.sale_items (
      business_id, sale_id, product_id, name, quantity, unit_price, cost_price, discount, tax, line_total
    ) values (
      _order.business_id, _sale_id, null, 'Delivery', 1, _order.delivery_fee, 0, 0, 0, _order.delivery_fee
    );
  end if;

  update public.sales set cost_total = _cost where id = _sale_id;
  insert into public.payments (business_id, sale_id, amount, method, reference, idempotency_key, created_by)
  values (
    _order.business_id, _sale_id, _order.total, _method, _order.reference,
    'store:' || _order.id::text, auth.uid()
  );
  update public.store_orders set sale_id = _sale_id, payment_status = 'paid' where id = _order.id;
  return _sale_id;
end;
$$;
revoke all on function public.storefront_record_sale(uuid) from public;

create or replace function public.transition_store_order(
  _business_id uuid,
  _order_id uuid,
  _action text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _order public.store_orders;
  _next text;
  _item public.store_order_items;
  _stock_before numeric(14,3);
  _stock_after numeric(14,3);
  _allow boolean;
begin
  select * into _order from public.store_orders
    where id = _order_id and business_id = _business_id for update;
  if not found then
    raise exception 'That order could not be found.' using errcode = 'B0001';
  end if;
  if _order.fulfilment_status = 'cancelled' then
    raise exception 'This order is cancelled.' using errcode = 'B0001';
  end if;

  if _action = 'mark_paid' then
    perform public.storefront_require_payments(_business_id);
    if _order.payment_status = 'paid' then
      return public.get_store_order_admin(_business_id, _order_id);
    end if;
    if _order.payment_method = 'quote' and _order.fulfilment_status = 'awaiting_confirmation' then
      raise exception 'Accept the quote before recording payment.' using errcode = 'B0001';
    end if;
    perform public.storefront_record_sale(_order.id);
    insert into public.store_order_events (business_id, order_id, event_type, message)
    values (_business_id, _order.id, 'paid', 'Payment recorded. This order is now included in sales.');
    insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary)
    values (_business_id, auth.uid(), 'store_order.paid', 'store_order', _order.id, 'Recorded payment for ' || _order.reference);
    return public.get_store_order_admin(_business_id, _order_id);
  end if;

  perform public.storefront_require_sales(_business_id);

  if _action = 'cancel' then
    if _order.sale_id is not null then
      raise exception 'Payment was recorded. Refund the sale from Sales history instead of cancelling it here.' using errcode = 'B0001';
    end if;
    perform public.storefront_restore_stock(_order.id);
    update public.store_orders
      set fulfilment_status = 'cancelled', payment_status = 'cancelled'
      where id = _order.id;
    insert into public.store_order_events (business_id, order_id, event_type, message)
    values (_business_id, _order.id, 'cancelled', 'Order cancelled. Reserved stock was returned when it had been held.');
    insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary)
    values (_business_id, auth.uid(), 'store_order.cancelled', 'store_order', _order.id, 'Cancelled ' || _order.reference);
    return public.get_store_order_admin(_business_id, _order_id);
  end if;

  if _action = 'accept' then
    if _order.payment_method <> 'quote' or _order.fulfilment_status <> 'awaiting_confirmation' then
      raise exception 'That update is not available for this order.' using errcode = 'B0001';
    end if;
    select coalesce(allow_negative_stock, false) into _allow
      from public.business_settings where business_id = _business_id;
    for _item in
      select * from public.store_order_items where order_id = _order.id order by product_id
    loop
      if _item.product_id is null then
        continue;
      end if;
      select stock into _stock_before from public.products
        where id = _item.product_id and business_id = _business_id and deleted_at is null and is_active
        for update;
      if not found then
        raise exception 'A product on this quote is no longer available.' using errcode = 'B0001';
      end if;
      if not coalesce(_allow, false) and _stock_before < _item.quantity then
        raise exception 'Not enough stock to accept this quote.' using errcode = 'B0001';
      end if;
      _stock_after := _stock_before - _item.quantity;
      update public.products set stock = _stock_after where id = _item.product_id;
      insert into public.inventory_movements (
        business_id, product_id, movement_type, quantity, stock_before, stock_after,
        reason, reference_type, reference_id, created_by
      ) values (
        _business_id, _item.product_id, 'sale', -_item.quantity, _stock_before, _stock_after,
        'Accepted quote ' || _order.reference, 'store_order', _order.id, auth.uid()
      );
    end loop;
    update public.store_orders
      set fulfilment_status = 'confirmed', stock_reserved = true
      where id = _order.id;
    insert into public.store_order_events (business_id, order_id, event_type, message)
    values (_business_id, _order.id, 'accepted', 'Quote accepted. Stock is now reserved. Payment is still unpaid.');
    return public.get_store_order_admin(_business_id, _order_id);
  end if;

  _next := case
    when _action = 'confirm' and _order.fulfilment_status = 'awaiting_confirmation' and _order.payment_method <> 'quote' then 'confirmed'
    when _action = 'preparing' and _order.fulfilment_status = 'confirmed' then 'preparing'
    when _action = 'ready' and _order.fulfilment_status = 'preparing' then 'ready'
    when _action = 'dispatch' and _order.fulfilment_status = 'ready' and _order.fulfilment_method = 'delivery' then 'out_for_delivery'
    when _action = 'complete' and _order.fulfilment_status = 'ready' and _order.fulfilment_method <> 'delivery' then 'completed'
    when _action = 'complete' and _order.fulfilment_status = 'out_for_delivery' then 'completed'
    else null
  end;
  if _next is null then
    raise exception 'That update is not available for this order.' using errcode = 'B0001';
  end if;
  update public.store_orders set fulfilment_status = _next where id = _order.id;
  insert into public.store_order_events (business_id, order_id, event_type, message)
  values (_business_id, _order.id, _next, 'Fulfilment updated to ' || replace(_next, '_', ' ') || '.');
  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary)
  values (_business_id, auth.uid(), 'store_order.updated', 'store_order', _order.id, 'Updated ' || _order.reference || ' to ' || _next);
  return public.get_store_order_admin(_business_id, _order_id);
end;
$$;

create or replace function public.list_public_store_paths()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
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
      order by updated_at desc
      limit 2000
    ) s
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_public_store(text, text, text, text, int, int) from public;
revoke all on function public.get_store_preview(text) from public;
revoke all on function public.quote_store_cart(text, jsonb, text) from public;
revoke all on function public.create_store_order(text, text, jsonb, jsonb, text, text) from public;
revoke all on function public.get_store_order(text, text, text) from public;
revoke all on function public.save_storefront(uuid, jsonb) from public;
revoke all on function public.set_product_listing(uuid, uuid, boolean, text, text, numeric, numeric, boolean) from public;
revoke all on function public.set_storefront_published(uuid, boolean) from public;
revoke all on function public.get_storefront_admin(uuid) from public;
revoke all on function public.get_store_order_admin(uuid, uuid) from public;
revoke all on function public.transition_store_order(uuid, uuid, text) from public;
revoke all on function public.list_public_store_paths() from public;

grant execute on function public.get_public_store(text, text, text, text, int, int) to anon, authenticated;
grant execute on function public.quote_store_cart(text, jsonb, text) to anon, authenticated;
grant execute on function public.create_store_order(text, text, jsonb, jsonb, text, text) to anon, authenticated;
grant execute on function public.get_store_order(text, text, text) to anon, authenticated;
grant execute on function public.list_public_store_paths() to anon, authenticated;
grant execute on function public.get_store_preview(text) to authenticated;
grant execute on function public.save_storefront(uuid, jsonb) to authenticated;
grant execute on function public.set_product_listing(uuid, uuid, boolean, text, text, numeric, numeric, boolean) to authenticated;
grant execute on function public.set_storefront_published(uuid, boolean) to authenticated;
grant execute on function public.get_storefront_admin(uuid) to authenticated;
grant execute on function public.get_store_order_admin(uuid, uuid) to authenticated;
grant execute on function public.transition_store_order(uuid, uuid, text) to authenticated;

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
      'store_order.created', 'store_order.updated', 'store_order.paid', 'store_order.cancelled'
    )
  );

-- Rollback (run manually only if this migration must be reverted before any
-- live online orders exist):
--   revoke execute on all new functions from anon, authenticated;
--   drop the new functions, then drop store_order_events, store_order_items,
--   store_orders, product_listings, storefronts;
--   alter table public.sales drop constraint sales_channel_check;
--   alter table public.sales drop column channel;
--   alter table public.business_counters drop column store_order_seq;
--   grant select (staff_password_hash) on public.businesses to authenticated;
--   restore the previous audit_logs_action_check from
--   20260828060000_sales_commission.sql.
-- Do not drop these objects once merchants have online orders.
