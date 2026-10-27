-- Stage 8: delivery zones, collection points, courier details, server-side delivery pricing.

alter table public.store_orders
  add column if not exists delivery_zone_id text,
  add column if not exists delivery_zone_name text,
  add column if not exists collection_point_id text,
  add column if not exists collection_point_name text,
  add column if not exists courier_name text,
  add column if not exists courier_reference text,
  add column if not exists courier_contact text,
  add column if not exists courier_tracking_url text,
  add column if not exists dispatched_at timestamptz,
  add column if not exists fulfilled_at timestamptz;

create or replace function public.storefront_delivery_stage8_extras(_raw jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  _method text;
  _zones jsonb := '[]'::jsonb;
  _points jsonb := '[]'::jsonb;
  _z jsonb;
  _p jsonb;
  _idx int := 0;
begin
  if coalesce((_raw->>'quoteRequired')::boolean, false) then
    _method := 'quote';
  elsif _raw->>'pricingMethod' in ('flat', 'zone', 'free') then
    _method := _raw->>'pricingMethod';
  else
    _method := 'flat';
  end if;

  for _z in
    select e
    from jsonb_array_elements(
      case when jsonb_typeof(_raw->'zones') = 'array' then _raw->'zones' else '[]'::jsonb end
    ) e
    limit 25
  loop
    if length(btrim(coalesce(_z->>'name', ''))) = 0 then
      continue;
    end if;
    _idx := _idx + 1;
    _zones := _zones || jsonb_build_array(jsonb_build_object(
      'id', left(btrim(coalesce(nullif(_z->>'id', ''), public.storefront_slugify(_z->>'name'), 'zone-' || _idx::text)), 40),
      'name', left(btrim(_z->>'name'), 80),
      'enabled', coalesce((_z->>'enabled')::boolean, true),
      'fee', greatest(coalesce((_z->>'fee')::numeric, 0), 0),
      'freeOver', case
        when nullif(_z->>'freeOver', '') is null then null
        else greatest((_z->>'freeOver')::numeric, 0)
      end,
      'minOrder', greatest(coalesce((_z->>'minOrder')::numeric, 0), 0),
      'estimate', left(btrim(coalesce(_z->>'estimate', '')), 120)
    ));
  end loop;

  _idx := 0;
  for _p in
    select e
    from jsonb_array_elements(
      case when jsonb_typeof(_raw->'collectionPoints') = 'array' then _raw->'collectionPoints' else '[]'::jsonb end
    ) e
    limit 10
  loop
    if length(btrim(coalesce(_p->>'name', ''))) = 0 then
      continue;
    end if;
    _idx := _idx + 1;
    _points := _points || jsonb_build_array(jsonb_build_object(
      'id', left(btrim(coalesce(nullif(_p->>'id', ''), public.storefront_slugify(_p->>'name'), 'pickup-' || _idx::text)), 40),
      'name', left(btrim(_p->>'name'), 80),
      'address', left(btrim(coalesce(_p->>'address', '')), 200),
      'phone', left(btrim(coalesce(_p->>'phone', '')), 30),
      'instructions', left(btrim(coalesce(_p->>'instructions', '')), 300),
      'enabled', coalesce((_p->>'enabled')::boolean, true)
    ));
  end loop;

  return jsonb_build_object(
    'pricingMethod', _method,
    'deliveryInstructions', left(btrim(coalesce(_raw->>'deliveryInstructions', '')), 500),
    'collectionInstructions', left(btrim(coalesce(_raw->>'collectionInstructions', '')), 500),
    'zones', _zones,
    'collectionPoints', _points
  );
end;
$$;

create or replace function public.storefront_delivery_rules(_raw jsonb)
returns jsonb
language sql
immutable
as $$
  select public.storefront_normalize_delivery(_raw);
$$;

-- Extend delivery normalization so saved storefront JSON keeps zones and collection points.
create or replace function public.storefront_normalize_delivery(_raw jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  _hours jsonb;
  _windows jsonb;
  _cutoff_time time;
  _cutoff_text text;
  _tz text;
begin
  _hours := public.storefront_normalize_hours(_raw->'weeklyHours');
  _windows := public.storefront_normalize_windows(_raw->'windows');
  _cutoff_time := coalesce(
    public.storefront_parse_hhmm(_raw->>'cutoffTime'),
    public.storefront_parse_hhmm(_raw->>'cutoff')
  );
  _tz := case when _raw->>'timezone' = 'UTC' then 'UTC' else 'Africa/Harare' end;
  if _cutoff_time is not null then
    _cutoff_text := to_char(_cutoff_time, 'HH24:MI');
  else
    _cutoff_text := left(btrim(coalesce(_raw->>'cutoff', '')), 120);
  end if;
  return jsonb_build_object(
    'pickupEnabled', coalesce((_raw->>'pickupEnabled')::boolean, true),
    'deliveryEnabled', coalesce((_raw->>'deliveryEnabled')::boolean, false),
    'flatFee', greatest(coalesce((_raw->>'flatFee')::numeric, 0), 0),
    'freeOver', case
      when nullif(_raw->>'freeOver', '') is null then null
      else greatest((_raw->>'freeOver')::numeric, 0)
    end,
    'minimumOrder', greatest(coalesce((_raw->>'minimumOrder')::numeric, 0), 0),
    'areas', left(btrim(coalesce(_raw->>'areas', '')), 300),
    'estimate', left(btrim(coalesce(_raw->>'estimate', '')), 120),
    'quoteRequired', coalesce((_raw->>'quoteRequired')::boolean, false),
    'autoAccept', coalesce((_raw->>'autoAccept')::boolean, false),
    'prepMinutes', least(greatest(coalesce((_raw->>'prepMinutes')::int, 0), 0), 10080),
    'cutoff', _cutoff_text,
    'cutoffTime', case when _cutoff_time is null then null else to_char(_cutoff_time, 'HH24:MI') end,
    'collectionWindows', case
      when jsonb_array_length(_windows) > 0 then public.storefront_windows_label(_windows)
      else left(btrim(coalesce(_raw->>'collectionWindows', '')), 200)
    end,
    'timezone', _tz,
    'weeklyHours', _hours,
    'windows', _windows
  ) || public.storefront_delivery_stage8_extras(_raw);
end;
$$;

create or replace function public.storefront_compute_delivery_fee(
  _delivery jsonb,
  _fulfilment text,
  _subtotal numeric,
  _zone_id text
) returns numeric
language plpgsql
immutable
as $$
declare
  _rules jsonb := public.storefront_delivery_rules(_delivery);
  _method text;
  _fee numeric(14,2) := 0;
  _zone jsonb;
  _zone_min numeric(14,2);
  _zone_free numeric(14,2);
begin
  if _fulfilment <> 'delivery' then
    return 0;
  end if;
  if coalesce((_rules->>'quoteRequired')::boolean, false) then
    return 0;
  end if;
  _method := coalesce(_rules->>'pricingMethod', 'flat');
  if _method = 'free' then
    return 0;
  end if;
  if _method = 'zone' then
    select z into _zone
    from jsonb_array_elements(coalesce(_rules->'zones', '[]'::jsonb)) z
    where z->>'id' = nullif(btrim(coalesce(_zone_id, '')), '')
      and coalesce((z->>'enabled')::boolean, true)
    limit 1;
    if _zone is null then
      raise exception 'Choose a delivery area this shop serves.' using errcode = 'B0001';
    end if;
    _zone_min := coalesce((_zone->>'minOrder')::numeric, 0);
    if _subtotal < _zone_min then
      raise exception 'This delivery area needs a minimum order of %.', _zone_min using errcode = 'B0001';
    end if;
    _fee := round(coalesce((_zone->>'fee')::numeric, 0), 2);
    if _fee < 0 then
      _fee := 0;
    end if;
    _zone_free := nullif(_zone->>'freeOver', '')::numeric;
    if _zone_free is not null and _subtotal >= _zone_free then
      _fee := 0;
    end if;
    return _fee;
  end if;
  _fee := round(coalesce((_rules->>'flatFee')::numeric, 0), 2);
  if _fee < 0 then
    _fee := 0;
  end if;
  if nullif(_rules->>'freeOver', '') is not null
     and _subtotal >= (_rules->>'freeOver')::numeric then
    _fee := 0;
  end if;
  return _fee;
end;
$$;

drop function if exists public.storefront_price_cart(uuid, jsonb, text, boolean);

create or replace function public.storefront_price_cart(
  _business_id uuid,
  _items jsonb,
  _fulfilment text,
  _lock boolean,
  _delivery_zone_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
  _rules jsonb;
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
  _rules := public.storefront_delivery_rules(_store.delivery);
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

  _min := coalesce((_rules->>'minimumOrder')::numeric, 0);
  if _subtotal < _min then
    raise exception 'This shop has a minimum order of %.', _min using errcode = 'B0001';
  end if;

  if _fulfilment = 'delivery' and coalesce((_rules->>'deliveryEnabled')::boolean, false) is not true then
    raise exception 'This shop does not offer delivery.' using errcode = 'B0001';
  end if;
  if _fulfilment = 'pickup' and coalesce((_rules->>'pickupEnabled')::boolean, false) is not true then
    raise exception 'This shop does not offer pickup.' using errcode = 'B0001';
  end if;
  if _fulfilment = 'quote' and coalesce((_store.payments->>'quotes')::boolean, false) is not true then
    raise exception 'This shop is not accepting quote requests.' using errcode = 'B0001';
  end if;

  if _fulfilment = 'delivery'
     and coalesce(_rules->>'pricingMethod', 'flat') = 'zone'
     and jsonb_array_length(coalesce(_rules->'zones', '[]'::jsonb)) > 0
     and nullif(btrim(coalesce(_delivery_zone_id, '')), '') is null then
    raise exception 'Choose a delivery area.' using errcode = 'B0001';
  end if;

  _fee := public.storefront_compute_delivery_fee(_store.delivery, _fulfilment, _subtotal, _delivery_zone_id);

  return jsonb_build_object(
    'currency', _biz.currency,
    'subtotal', _subtotal,
    'tax', _tax,
    'deliveryFee', _fee,
    'total', _subtotal + _tax + _fee,
    'lines', _priced,
    'deliveryZoneId', nullif(btrim(coalesce(_delivery_zone_id, '')), '')
  );
end;
$$;

revoke all on function public.storefront_price_cart(uuid, jsonb, text, boolean, text) from public;

drop function if exists public.quote_store_cart(text, jsonb, text);

create or replace function public.quote_store_cart(
  _slug text,
  _items jsonb,
  _fulfilment text,
  _delivery_zone_id text default null,
  _collection_point_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _store public.storefronts;
  _priced jsonb;
  _rules jsonb;
  _point jsonb;
begin
  if not public.check_rate_limit('store-quote:' || coalesce(_slug, ''), 60, 60) then
    raise exception 'Too many requests. Please wait a moment and try again.' using errcode = 'B0001';
  end if;
  _store := public.storefront_require_customer_shop(_slug);
  _rules := public.storefront_delivery_rules(_store.delivery);
  if _fulfilment = 'delivery' and coalesce((_rules->>'quoteRequired')::boolean, false) then
    raise exception 'This shop quotes delivery. Request a quote instead of a priced delivery order.' using errcode = 'B0001';
  end if;
  if _fulfilment = 'pickup' and jsonb_array_length(coalesce(_rules->'collectionPoints', '[]'::jsonb)) > 0 then
    if nullif(btrim(coalesce(_collection_point_id, '')), '') is null then
      raise exception 'Choose a collection location.' using errcode = 'B0001';
    end if;
    select p into _point
    from jsonb_array_elements(_rules->'collectionPoints') p
    where p->>'id' = _collection_point_id and coalesce((p->>'enabled')::boolean, true)
    limit 1;
    if _point is null then
      raise exception 'That collection location is not available.' using errcode = 'B0001';
    end if;
  end if;
  perform public.storefront_assert_fulfilment_clock(_store.delivery, _fulfilment, null, false);
  _priced := public.storefront_price_cart(_store.business_id, _items, _fulfilment, false, _delivery_zone_id);
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

grant execute on function public.quote_store_cart(text, jsonb, text, text, text) to anon, authenticated;

-- create_store_order: extended checkout validation (based on 20261027200000 hardening).
drop function if exists public.create_store_order(text, text, jsonb, jsonb, text, text, timestamptz);

create or replace function public.create_store_order(
  _slug text,
  _idempotency_key text,
  _customer jsonb,
  _items jsonb,
  _fulfilment text,
  _payment_method text,
  _collect_at timestamptz default null,
  _delivery_zone_id text default null,
  _collection_point_id text default null
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
  _status text := 'awaiting_confirmation';
  _terms jsonb;
  _delivery jsonb;
  _payments jsonb;
  _slot timestamptz;
  _shopper uuid := auth.uid();
  _zone jsonb;
  _zone_name text;
  _point jsonb;
  _point_name text;
begin
  if not public.check_rate_limit('store-order:' || coalesce(_slug, ''), 20, 60) then
    raise exception 'Too many orders just now. Please wait a minute and try again.' using errcode = 'B0001';
  end if;
  if _idempotency_key is null or length(btrim(_idempotency_key)) < 8 or length(_idempotency_key) > 80 then
    raise exception 'This checkout could not be started. Refresh the page and try again.' using errcode = 'B0001';
  end if;
  if _payment_method not in ('pay_on_pickup', 'pay_on_delivery', 'quote', 'paynow', 'manual') then
    raise exception 'That payment method is not available.' using errcode = 'B0001';
  end if;

  _store := public.storefront_require_customer_shop(_slug);
  _delivery := public.storefront_delivery_rules(_store.delivery);
  _payments := public.storefront_normalize_payments(_store.payments, _delivery);

  perform pg_advisory_xact_lock(hashtext('store-order'), hashtext(_store.business_id::text || ':' || _idempotency_key));

  select * into _existing from public.store_orders
    where business_id = _store.business_id and idempotency_key = _idempotency_key;
  if found then
    return jsonb_build_object(
      'reference', _existing.reference,
      'replayed', true,
      'accessToken', null,
      'orderId', _existing.id,
      'fulfilmentStatus', _existing.fulfilment_status,
      'paymentStatus', _existing.payment_status,
      'paymentMethod', _existing.payment_method,
      'total', _existing.total,
      'currency', _existing.currency,
      'collectAt', _existing.collect_at
    );
  end if;

  if coalesce((_delivery->>'quoteRequired')::boolean, false) and _fulfilment = 'delivery' then
    raise exception 'This shop quotes delivery. Request a quote instead of a priced delivery order.' using errcode = 'B0001';
  end if;

  if _payment_method = 'quote' then
    _fulfilment := 'quote';
    _reserve := false;
  elsif _payment_method = 'pay_on_pickup' then
    if _fulfilment <> 'pickup' or coalesce((_payments->>'payOnPickup')::boolean, false) is not true then
      raise exception 'Pay on pickup is not available for this order.' using errcode = 'B0001';
    end if;
  elsif _payment_method = 'pay_on_delivery' then
    if _fulfilment <> 'delivery' or coalesce((_payments->>'payOnDelivery')::boolean, false) is not true then
      raise exception 'Pay on delivery is not available for this order.' using errcode = 'B0001';
    end if;
  elsif _payment_method = 'paynow' then
    if _fulfilment not in ('pickup', 'delivery') then
      raise exception 'Paynow is only available for pickup or delivery orders.' using errcode = 'B0001';
    end if;
    if not public.shop_offers_paynow(_store.slug) then
      raise exception 'This shop has not connected Paynow for customer checkout.' using errcode = 'B0001';
    end if;
  elsif _payment_method = 'manual' then
    if _fulfilment not in ('pickup', 'delivery') then
      raise exception 'That payment method is only available for pickup or delivery orders.' using errcode = 'B0001';
    end if;
    if not exists (
      select 1
      from jsonb_array_elements(coalesce(_payments->'manualMethods', '[]'::jsonb)) m
      where coalesce((m->>'enabled')::boolean, false)
        and m->>'id' = coalesce(_customer->>'manualMethodId', '')
        and (
          length(btrim(coalesce(m->>'accountDetail', ''))) > 0
          or length(btrim(coalesce(m->>'instructions', ''))) > 0
        )
    ) then
      raise exception 'That payment method is not available.' using errcode = 'B0001';
    end if;
  end if;

  _slot := public.storefront_assert_fulfilment_clock(_delivery, _fulfilment, _collect_at, true);

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
  if _payment_method = 'paynow' and _email is null then
    raise exception 'Enter an email so Paynow can send the payment confirmation.' using errcode = 'B0001';
  end if;
  if _fulfilment = 'delivery' and _address is null then
    raise exception 'Enter a delivery address.' using errcode = 'B0001';
  end if;
  if _fulfilment = 'quote' and coalesce((_payments->>'quotes')::boolean, false) is not true then
    raise exception 'This shop is not accepting quote requests.' using errcode = 'B0001';
  end if;

  _zone_name := null;
  if _fulfilment = 'delivery' and coalesce(_delivery->>'pricingMethod', 'flat') = 'zone' then
    select z into _zone
    from jsonb_array_elements(coalesce(_delivery->'zones', '[]'::jsonb)) z
    where z->>'id' = nullif(btrim(coalesce(_delivery_zone_id, '')), '')
      and coalesce((z->>'enabled')::boolean, true)
    limit 1;
    if _zone is null and jsonb_array_length(coalesce(_delivery->'zones', '[]'::jsonb)) > 0 then
      raise exception 'Choose a delivery area this shop serves.' using errcode = 'B0001';
    end if;
    if _zone is not null then
      _zone_name := _zone->>'name';
    end if;
  end if;

  _point_name := null;
  if _fulfilment = 'pickup' and jsonb_array_length(coalesce(_delivery->'collectionPoints', '[]'::jsonb)) > 0 then
    if nullif(btrim(coalesce(_collection_point_id, '')), '') is null then
      raise exception 'Choose a collection location.' using errcode = 'B0001';
    end if;
    select p into _point
    from jsonb_array_elements(_delivery->'collectionPoints') p
    where p->>'id' = _collection_point_id and coalesce((p->>'enabled')::boolean, true)
    limit 1;
    if _point is null then
      raise exception 'That collection location is not available.' using errcode = 'B0001';
    end if;
    _point_name := _point->>'name';
  end if;

  _priced := public.storefront_price_cart(_store.business_id, _items, _fulfilment, true, _delivery_zone_id);
  if (_priced->>'total')::numeric <= 0 then
    raise exception 'This order total must be greater than zero.' using errcode = 'B0001';
  end if;

  if _payment_method <> 'quote' and coalesce((_delivery->>'autoAccept')::boolean, false) then
    _status := 'confirmed';
  end if;

  _terms := jsonb_build_object(
    'delivery', _delivery,
    'payments', _payments,
    'currency', _priced->>'currency',
    'deliveryFee', (_priced->>'deliveryFee')::numeric,
    'subtotal', (_priced->>'subtotal')::numeric,
    'tax', (_priced->>'tax')::numeric,
    'total', (_priced->>'total')::numeric,
    'collectAt', _slot,
    'deliveryZoneId', nullif(btrim(coalesce(_delivery_zone_id, '')), ''),
    'deliveryZoneName', _zone_name,
    'collectionPointId', nullif(btrim(coalesce(_collection_point_id, '')), ''),
    'collectionPointName', _point_name
  );
  if _payment_method = 'manual' then
    select m into _line
    from jsonb_array_elements(coalesce(_payments->'manualMethods', '[]'::jsonb)) m
    where m->>'id' = coalesce(_customer->>'manualMethodId', '')
    limit 1;
    _terms := _terms || jsonb_build_object('manualPayment', _line);
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
    stock_reserved, token_hash, terms, collect_at, shopper_user_id,
    delivery_zone_id, delivery_zone_name, collection_point_id, collection_point_name
  ) values (
    _order_id, _store.business_id, _reference, _idempotency_key, _status, 'unpaid',
    _payment_method, _fulfilment, _name, _phone, _email, _address, _notes,
    (_priced->>'subtotal')::numeric, (_priced->>'tax')::numeric, (_priced->>'deliveryFee')::numeric,
    (_priced->>'total')::numeric, _priced->>'currency', false,
    extensions.crypt(_token, extensions.gen_salt('bf')),
    _terms, _slot, _shopper,
    nullif(btrim(coalesce(_delivery_zone_id, '')), ''), _zone_name,
    nullif(btrim(coalesce(_collection_point_id, '')), ''), _point_name
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

  if _shopper is not null and (_customer ? 'messagesConsent') then
    perform public.storefront_upsert_shopper_consent(
      _store.business_id,
      coalesce((_customer->>'messagesConsent')::boolean, false)
    );
  end if;

  insert into public.store_order_events (business_id, order_id, event_type, message)
  values (
    _store.business_id, _order_id, 'created',
    case
      when _payment_method = 'quote' then 'Quote request received. This is not a paid order.'
      when _slot is not null then 'Order received for collection at ' || to_char(timezone(coalesce(_delivery->>'timezone', 'Africa/Harare'), _slot), 'Dy HH24:MI') || '. Payment has not been recorded yet.'
      when _point_name is not null then 'Order received for collection at ' || _point_name || '. Payment has not been recorded yet.'
      when _zone_name is not null then 'Order received for delivery to ' || _zone_name || '. Payment has not been recorded yet.'
      when _status = 'confirmed' then 'Order accepted automatically. Payment has not been recorded yet.'
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
    _store.business_id, _shopper, 'store_order.created', 'store_order', _order_id,
    'Online order ' || _reference
  );

  if _email is not null then
    perform public.enqueue_shopper_order_email(_order_id, 'placed', _token, null);
  end if;

  return jsonb_build_object(
    'reference', _reference,
    'replayed', false,
    'accessToken', _token,
    'orderId', _order_id,
    'fulfilmentStatus', _status,
    'paymentStatus', 'unpaid',
    'paymentMethod', _payment_method,
    'fulfilmentMethod', _fulfilment,
    'total', (_priced->>'total')::numeric,
    'currency', _priced->>'currency',
    'subtotal', (_priced->>'subtotal')::numeric,
    'tax', (_priced->>'tax')::numeric,
    'deliveryFee', (_priced->>'deliveryFee')::numeric,
    'collectAt', _slot
  );
end;
$$;

grant execute on function public.create_store_order(text, text, jsonb, jsonb, text, text, timestamptz, text, text) to anon, authenticated;

create or replace function public.save_store_order_courier(
  _business_id uuid,
  _order_id uuid,
  _courier_name text,
  _courier_reference text,
  _courier_contact text,
  _courier_tracking_url text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _order public.store_orders;
  _name text;
  _ref text;
  _contact text;
  _url text;
  _changed boolean := false;
begin
  perform public.storefront_require_sales(_business_id);
  if auth.uid() is null then
    raise exception 'Sign in to update this order.' using errcode = 'B0002';
  end if;
  select * into _order
  from public.store_orders
  where id = _order_id and business_id = _business_id
  for update;
  if not found then
    raise exception 'That order could not be found.' using errcode = 'B0001';
  end if;
  if _order.fulfilment_method <> 'delivery' then
    raise exception 'Courier details apply to delivery orders only.' using errcode = 'B0001';
  end if;

  _name := nullif(public.storefront_plain(_courier_name, 80), '');
  _ref := nullif(public.storefront_plain(_courier_reference, 80), '');
  _contact := nullif(public.storefront_plain(_courier_contact, 80), '');
  _url := public.storefront_https(_courier_tracking_url);

  if coalesce(_name, '') is distinct from coalesce(_order.courier_name, '')
     or coalesce(_ref, '') is distinct from coalesce(_order.courier_reference, '')
     or coalesce(_contact, '') is distinct from coalesce(_order.courier_contact, '')
     or coalesce(_url, '') is distinct from coalesce(_order.courier_tracking_url, '') then
    _changed := true;
  end if;

  update public.store_orders
  set
    courier_name = _name,
    courier_reference = _ref,
    courier_contact = _contact,
    courier_tracking_url = _url,
    dispatched_at = case
      when _changed and dispatched_at is null and (_name is not null or _ref is not null) then now()
      else dispatched_at
    end
  where id = _order_id;

  if _changed then
    insert into public.store_order_events (business_id, order_id, event_type, message)
    values (
      _order.business_id, _order_id, 'tracking_updated',
      trim(both from concat_ws(' · ',
        case when _name is not null then 'Courier: ' || _name else null end,
        case when _ref is not null then 'Ref: ' || _ref else null end,
        case when _url is not null then 'Track online' else null end
      ))
    );
  end if;

  return public.get_store_order_admin(_business_id, _order_id);
end;
$$;

revoke all on function public.save_store_order_courier(uuid, uuid, text, text, text, text) from public, anon;
grant execute on function public.save_store_order_courier(uuid, uuid, text, text, text, text) to authenticated;

create or replace function public.get_store_order_admin(_business_id uuid, _order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
    'collectAt', _order.collect_at,
    'sellerInternalNote', coalesce(_order.seller_internal_note, ''),
    'deliveryZoneId', _order.delivery_zone_id,
    'deliveryZoneName', _order.delivery_zone_name,
    'collectionPointId', _order.collection_point_id,
    'collectionPointName', _order.collection_point_name,
    'courierName', _order.courier_name,
    'courierReference', _order.courier_reference,
    'courierContact', _order.courier_contact,
    'courierTrackingUrl', _order.courier_tracking_url,
    'dispatchedAt', _order.dispatched_at,
    'fulfilledAt', _order.fulfilled_at,
    'items', _items,
    'events', _events,
    'terms', coalesce(_order.terms, '{}'::jsonb)
  );
end;
$$;

create or replace function public.transition_store_order(
  _business_id uuid,
  _order_id uuid,
  _action text,
  _reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _result jsonb;
  _reason_clean text;
begin
  _reason_clean := nullif(public.storefront_plain(_reason, 400), '');
  if _action = 'mark_paid' then
    return public.record_store_order_payment(_business_id, _order_id, null);
  end if;
  if _action = 'cancel' and _reason_clean is null then
    raise exception 'Enter a reason for cancelling this order.' using errcode = 'B0001';
  end if;
  _result := public.transition_store_order_legacy_20261023(_business_id, _order_id, _action);
  if _action = 'dispatch' then
    update public.store_orders
    set dispatched_at = coalesce(dispatched_at, now())
    where id = _order_id and business_id = _business_id;
  elsif _action = 'complete' then
    update public.store_orders
    set fulfilled_at = coalesce(fulfilled_at, now())
    where id = _order_id and business_id = _business_id;
  elsif _action = 'cancel' then
    update public.store_order_events e
    set message = 'Order cancelled. Reason: ' || _reason_clean
    where e.order_id = _order_id
      and e.event_type = 'cancelled'
      and e.id = (
        select id from public.store_order_events
        where order_id = _order_id and event_type = 'cancelled'
        order by created_at desc
        limit 1
      );
    update public.audit_logs
    set summary = summary || ' — ' || _reason_clean
    where business_id = _business_id
      and entity_type = 'store_order'
      and entity_id = _order_id
      and action = 'store_order.cancelled'
      and created_at >= now() - interval '10 seconds';
  end if;
  return _result;
end;
$$;

-- Email notifications for tracking updates (Stage 7 outbox).
create or replace function public.enqueue_merchant_order_event_email()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  _order public.store_orders;
  _subject text;
  _body text;
  _template text := 'merchant.order.event';
begin
  if new.event_type = 'created' then
    return new;
  end if;
  if new.event_type in (
    'cancelled', 'paid', 'accepted', 'confirmed', 'preparing', 'ready',
    'out_for_delivery', 'completed', 'seller_payment_confirmed', 'tracking_updated'
  ) then
    select * into _order from public.store_orders where id = new.order_id;
    if not found then
      return new;
    end if;
    _subject := 'Order ' || _order.reference || ': ' || replace(coalesce(new.event_type, 'update'), '_', ' ');
    _body := coalesce(new.message, new.event_type);

    insert into public.notification_outbox (
      business_id, notification_id, channel, to_email, subject, body,
      idempotency_key, email_template, order_id, store_order_event_id,
      recipient_role, metadata
    )
    select
      new.business_id,
      null,
      'email',
      lower(u.email),
      left(_subject, 120),
      _body,
      new.order_id::text || ':merchant:event:' || new.id::text || ':' || lower(u.email),
      _template,
      new.order_id,
      new.id,
      'merchant',
      jsonb_build_object('eventType', new.event_type, 'eventMessage', new.message)
    from public.business_members m
    join auth.users u on u.id = m.user_id
    where m.business_id = new.business_id
      and m.is_active
      and m.notify_email
      and m.role in ('owner', 'admin', 'manager')
      and u.email is not null
      and length(btrim(u.email)) > 3
    on conflict (idempotency_key) do nothing;
  end if;
  return new;
end;
$$;

update public.storefronts
set delivery = public.storefront_normalize_delivery(delivery)
where delivery is not null;
