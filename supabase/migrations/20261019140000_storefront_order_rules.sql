-- Merchant order rules: cash policy, quoted delivery, automatic acceptance.
-- Confirmed orders snapshot the rules so later setting changes do not rewrite history.
-- Customer Paynow remains disabled.

alter table public.store_orders
  add column if not exists terms jsonb not null default '{}'::jsonb;

create or replace function public.storefront_normalize_delivery(_raw jsonb)
returns jsonb
language sql immutable as $$
  select jsonb_build_object(
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
    'cutoff', left(btrim(coalesce(_raw->>'cutoff', '')), 120),
    'collectionWindows', left(btrim(coalesce(_raw->>'collectionWindows', '')), 200)
  );
$$;

create or replace function public.storefront_normalize_payments(_raw jsonb, _delivery jsonb)
returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'payOnPickup', coalesce((_raw->>'payOnPickup')::boolean, true)
      and coalesce((_delivery->>'pickupEnabled')::boolean, false),
    'payOnDelivery', coalesce((_raw->>'payOnDelivery')::boolean, false)
      and coalesce((_delivery->>'deliveryEnabled')::boolean, false)
      and coalesce((_delivery->>'quoteRequired')::boolean, false) is not true,
    'quotes', coalesce((_raw->>'quotes')::boolean, false)
      or coalesce((_delivery->>'quoteRequired')::boolean, false),
    'paynow', false,
    'cashCurrencies', left(btrim(coalesce(nullif(_raw->>'cashCurrencies', ''), '')), 40),
    'exactCash', coalesce((_raw->>'exactCash')::boolean, false),
    'changeProvided', coalesce((_raw->>'changeProvided')::boolean, false)
      and coalesce((_raw->>'exactCash')::boolean, false) is not true
  );
$$;

revoke all on function public.storefront_normalize_delivery(jsonb) from public;
revoke all on function public.storefront_normalize_payments(jsonb, jsonb) from public;

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

  _delivery := public.storefront_normalize_delivery(_patch->'delivery');
  _payments := public.storefront_normalize_payments(_patch->'payments', _delivery);
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
  _status text := 'awaiting_confirmation';
  _terms jsonb;
  _delivery jsonb;
  _payments jsonb;
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
      'currency', _existing.currency
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
    'total', (_priced->>'total')::numeric
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
    stock_reserved, token_hash, terms
  ) values (
    _order_id, _store.business_id, _reference, _idempotency_key, _status, 'unpaid',
    _payment_method, _fulfilment, _name, _phone, _email, _address, _notes,
    (_priced->>'subtotal')::numeric, (_priced->>'tax')::numeric, (_priced->>'deliveryFee')::numeric,
    (_priced->>'total')::numeric, _priced->>'currency', false,
    extensions.crypt(_token, extensions.gen_salt('bf')),
    _terms
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
    'deliveryFee', (_priced->>'deliveryFee')::numeric
  );
end;
$$;

update public.storefronts
set
  delivery = public.storefront_normalize_delivery(delivery),
  payments = public.storefront_normalize_payments(payments, public.storefront_normalize_delivery(delivery));

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
    'items', _items,
    'events', _events,
    'terms', coalesce(_order.terms, '{}'::jsonb)
  );
end;
$$;
