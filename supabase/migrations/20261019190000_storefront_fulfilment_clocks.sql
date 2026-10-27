-- Structured shop hours, cut-off time, and collection windows.
-- Free-text hours/cutoff notes stay display-only until the merchant saves clocks.
-- Quote requests skip the clocks. Bookable pickup slots exist only when windows are saved.

alter table public.store_orders
  add column if not exists collect_at timestamptz;

create or replace function public.storefront_parse_hhmm(_raw text)
returns time
language plpgsql immutable as $$
begin
  if _raw is null or btrim(_raw) = '' then
    return null;
  end if;
  if btrim(_raw) !~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$' then
    return null;
  end if;
  return btrim(_raw)::time;
end;
$$;

create or replace function public.storefront_normalize_hours(_raw jsonb)
returns jsonb
language plpgsql immutable as $$
declare
  _out jsonb := '[]'::jsonb;
  _dow int;
  _row jsonb;
  _open time;
  _close time;
begin
  if _raw is null or jsonb_typeof(_raw) <> 'array' then
    return _out;
  end if;
  for _dow in 1..7 loop
    select e into _row
    from jsonb_array_elements(_raw) e
    where (e->>'weekday')::int = _dow
    limit 1;
    if _row is null or coalesce((_row->>'closed')::boolean, false) then
      continue;
    end if;
    _open := public.storefront_parse_hhmm(_row->>'open');
    _close := public.storefront_parse_hhmm(_row->>'close');
    if _open is null or _close is null or _close <= _open then
      continue;
    end if;
    _out := _out || jsonb_build_array(jsonb_build_object(
      'weekday', _dow,
      'open', to_char(_open, 'HH24:MI'),
      'close', to_char(_close, 'HH24:MI')
    ));
  end loop;
  return _out;
end;
$$;

create or replace function public.storefront_normalize_windows(_raw jsonb)
returns jsonb
language plpgsql immutable as $$
declare
  _out jsonb := '[]'::jsonb;
  _row jsonb;
  _dow int;
  _start time;
  _end time;
  _n int := 0;
begin
  if _raw is null or jsonb_typeof(_raw) <> 'array' then
    return _out;
  end if;
  for _row in select * from jsonb_array_elements(_raw)
  loop
    _dow := nullif(_row->>'weekday', '')::int;
    _start := public.storefront_parse_hhmm(_row->>'start');
    _end := public.storefront_parse_hhmm(_row->>'end');
    if _dow is null or _dow < 1 or _dow > 7 or _start is null or _end is null or _end <= _start then
      continue;
    end if;
    _n := _n + 1;
    exit when _n > 21;
    _out := _out || jsonb_build_array(jsonb_build_object(
      'weekday', _dow,
      'start', to_char(_start, 'HH24:MI'),
      'end', to_char(_end, 'HH24:MI')
    ));
  end loop;
  return _out;
end;
$$;

create or replace function public.storefront_windows_label(_windows jsonb)
returns text
language sql immutable as $$
  select left(coalesce(string_agg(
    case (w->>'weekday')::int
      when 1 then 'Mon'
      when 2 then 'Tue'
      when 3 then 'Wed'
      when 4 then 'Thu'
      when 5 then 'Fri'
      when 6 then 'Sat'
      else 'Sun'
    end || ' ' || (w->>'start') || '-' || (w->>'end'),
    ', ' order by (w->>'weekday')::int, w->>'start'
  ), ''), 200)
  from jsonb_array_elements(_windows) w;
$$;

create or replace function public.storefront_normalize_delivery(_raw jsonb)
returns jsonb
language plpgsql immutable as $$
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
  );
end;
$$;

create or replace function public.storefront_is_open(
  _hours jsonb,
  _weekday int,
  _at time
) returns boolean
language plpgsql immutable as $$
declare
  _row jsonb;
  _open time;
  _close time;
begin
  if _hours is null or jsonb_typeof(_hours) <> 'array' or jsonb_array_length(_hours) = 0 then
    return true;
  end if;
  select e into _row
  from jsonb_array_elements(_hours) e
  where (e->>'weekday')::int = _weekday
  limit 1;
  if _row is null then
    return false;
  end if;
  _open := public.storefront_parse_hhmm(_row->>'open');
  _close := public.storefront_parse_hhmm(_row->>'close');
  if _open is null or _close is null or _close <= _open then
    return false;
  end if;
  return _at >= _open and _at < _close;
end;
$$;

create or replace function public.storefront_assert_fulfilment_clock(
  _delivery jsonb,
  _fulfilment text,
  _collect_at timestamptz,
  _require_slot boolean,
  _now timestamptz default null
) returns timestamptz
language plpgsql as $$
declare
  _rules jsonb := public.storefront_normalize_delivery(_delivery);
  _tz text;
  _at timestamptz := coalesce(_now, clock_timestamp());
  _local timestamp;
  _dow int;
  _now_time time;
  _prep int;
  _cutoff time;
  _hours jsonb;
  _windows jsonb;
  _has_hours boolean;
  _has_windows boolean;
  _collect_local timestamp;
  _collect_time time;
  _collect_dow int;
  _matched boolean := false;
  _win jsonb;
  _ready interval;
begin
  if _fulfilment = 'quote' then
    return null;
  end if;
  _tz := coalesce(_rules->>'timezone', 'Africa/Harare');
  _local := timezone(_tz, _at);
  _dow := extract(isodow from _local)::int;
  _now_time := _local::time;
  _prep := coalesce((_rules->>'prepMinutes')::int, 0);
  _cutoff := public.storefront_parse_hhmm(_rules->>'cutoffTime');
  _hours := coalesce(_rules->'weeklyHours', '[]'::jsonb);
  _windows := coalesce(_rules->'windows', '[]'::jsonb);
  _has_hours := jsonb_array_length(_hours) > 0;
  _has_windows := jsonb_array_length(_windows) > 0;
  _ready := make_interval(mins => _prep);

  if _fulfilment = 'pickup' and _has_windows then
    if not _require_slot then
      return null;
    end if;
    if _collect_at is null then
      raise exception 'Choose a collection time.' using errcode = 'B0001';
    end if;
    if _collect_at < _at + _ready then
      raise exception 'There is not enough preparation time before that collection.' using errcode = 'B0001';
    end if;
    _collect_local := timezone(_tz, _collect_at);
    _collect_dow := extract(isodow from _collect_local)::int;
    _collect_time := _collect_local::time;
    if _has_hours and not public.storefront_is_open(_hours, _collect_dow, _collect_time) then
      raise exception 'That collection time is outside shop hours.' using errcode = 'B0001';
    end if;
    for _win in select * from jsonb_array_elements(_windows)
    loop
      if (_win->>'weekday')::int = _collect_dow
        and _collect_time >= public.storefront_parse_hhmm(_win->>'start')
        and _collect_time < public.storefront_parse_hhmm(_win->>'end')
      then
        _matched := true;
        exit;
      end if;
    end loop;
    if not _matched then
      raise exception 'That collection time is not in this shop''s windows.' using errcode = 'B0001';
    end if;
    if _collect_local::date = _local::date and _cutoff is not null and _now_time >= _cutoff then
      raise exception 'The order cut-off for today has passed.' using errcode = 'B0001';
    end if;
    return _collect_at;
  end if;

  if _has_hours and not public.storefront_is_open(_hours, _dow, _now_time) then
    raise exception 'This shop is closed right now.' using errcode = 'B0001';
  end if;
  if _cutoff is not null and _now_time >= _cutoff then
    raise exception 'The order cut-off for today has passed.' using errcode = 'B0001';
  end if;
  if _prep > 0 and _has_hours then
    _collect_local := _local + _ready;
    if _collect_local::date <> _local::date
      or not public.storefront_is_open(_hours, _dow, _collect_local::time)
    then
      raise exception 'There is not enough time left today to prepare this order.' using errcode = 'B0001';
    end if;
  end if;
  return null;
end;
$$;

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

drop function if exists public.create_store_order(text, text, jsonb, jsonb, text, text);

create or replace function public.create_store_order(
  _slug text,
  _idempotency_key text,
  _customer jsonb,
  _items jsonb,
  _fulfilment text,
  _payment_method text,
  _collect_at timestamptz default null
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
  _delivery := public.storefront_normalize_delivery(_store.delivery);
  _payments := public.storefront_normalize_payments(_store.payments, _delivery);

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
  if _fulfilment = 'delivery' and _address is null then
    raise exception 'Enter a delivery address.' using errcode = 'B0001';
  end if;
  if _fulfilment = 'quote' and coalesce((_payments->>'quotes')::boolean, false) is not true then
    raise exception 'This shop is not accepting quote requests.' using errcode = 'B0001';
  end if;

  _priced := public.storefront_price_cart(_store.business_id, _items, _fulfilment, true);
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
    'collectAt', _slot
  );

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
    stock_reserved, token_hash, terms, collect_at
  ) values (
    _order_id, _store.business_id, _reference, _idempotency_key, _status, 'unpaid',
    _payment_method, _fulfilment, _name, _phone, _email, _address, _notes,
    (_priced->>'subtotal')::numeric, (_priced->>'tax')::numeric, (_priced->>'deliveryFee')::numeric,
    (_priced->>'total')::numeric, _priced->>'currency', false,
    extensions.crypt(_token, extensions.gen_salt('bf')),
    _terms, _slot
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
    case
      when _payment_method = 'quote' then 'Quote request received. This is not a paid order.'
      when _slot is not null then 'Order received for collection at ' || to_char(timezone(coalesce(_delivery->>'timezone', 'Africa/Harare'), _slot), 'Dy HH24:MI') || '. Payment has not been recorded yet.'
      when _status = 'confirmed' then 'Order accepted automatically. Payment has not been recorded yet.'
      else 'Order received. Payment has not been recorded yet.'
    end
  );

  insert into public.notifications (business_id, type, title, message, severity, link)
  values (
    _store.business_id, 'store_order',
    case when _payment_method = 'quote' then 'New quote request ' || _reference else 'New online order ' || _reference end,
    _name || ' · ' || _priced->>'currency' || ' ' || (_priced->>'total'),
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
  _eligible boolean;
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
  _eligible := public.storefront_review_eligible(_order);
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', i.name,
    'quantity', i.quantity,
    'unitPrice', i.unit_price,
    'lineTotal', i.line_total,
    'note', i.note,
    'productId', i.product_id,
    'canReview', _eligible and i.product_id is not null and not exists (
      select 1 from public.store_reviews r
      where r.order_id = i.order_id and r.product_id = i.product_id
    ),
    'reviewed', exists (
      select 1 from public.store_reviews r
      where r.order_id = i.order_id and r.product_id = i.product_id
    )
  ) order by i.name), '[]'::jsonb) into _items
  from public.store_order_items i where i.order_id = _order.id;

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
    'collectAt', _order.collect_at,
    'items', _items,
    'paid', _order.payment_status = 'paid',
    'revenueRecorded', _order.sale_id is not null,
    'terms', coalesce(_order.terms, '{}'::jsonb)
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
    'collectAt', _order.collect_at,
    'items', _items,
    'events', _events,
    'terms', coalesce(_order.terms, '{}'::jsonb)
  );
end;
$$;

update public.storefronts
set delivery = public.storefront_normalize_delivery(delivery);

revoke all on function public.storefront_parse_hhmm(text) from public, anon, authenticated;
revoke all on function public.storefront_normalize_hours(jsonb) from public, anon, authenticated;
revoke all on function public.storefront_normalize_windows(jsonb) from public, anon, authenticated;
revoke all on function public.storefront_windows_label(jsonb) from public, anon, authenticated;
revoke all on function public.storefront_is_open(jsonb, int, time) from public, anon, authenticated;
revoke all on function public.storefront_assert_fulfilment_clock(jsonb, text, timestamptz, boolean, timestamptz) from public, anon, authenticated;
revoke all on function public.storefront_normalize_delivery(jsonb) from public;
revoke all on function public.quote_store_cart(text, jsonb, text) from public;
revoke all on function public.create_store_order(text, text, jsonb, jsonb, text, text, timestamptz) from public, anon;
revoke all on function public.get_store_order(text, text, text) from public;
revoke all on function public.get_store_order_admin(uuid, uuid) from public, anon;

grant execute on function public.quote_store_cart(text, jsonb, text) to anon, authenticated;
grant execute on function public.create_store_order(text, text, jsonb, jsonb, text, text, timestamptz) to anon, authenticated;
grant execute on function public.get_store_order(text, text, text) to anon, authenticated;
grant execute on function public.get_store_order_admin(uuid, uuid) to authenticated;
