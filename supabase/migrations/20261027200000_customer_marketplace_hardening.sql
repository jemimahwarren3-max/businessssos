
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
  _shopper uuid := auth.uid();
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
  _store := public.storefront_require_customer_shop(_slug);
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
    stock_reserved, token_hash, terms, collect_at, shopper_user_id
  ) values (
    _order_id, _store.business_id, _reference, _idempotency_key, _status, 'unpaid',
    _payment_method, _fulfilment, _name, _phone, _email, _address, _notes,
    (_priced->>'subtotal')::numeric, (_priced->>'tax')::numeric, (_priced->>'deliveryFee')::numeric,
    (_priced->>'total')::numeric, _priced->>'currency', false,
    extensions.crypt(_token, extensions.gen_salt('bf')),
    _terms, _slot, _shopper
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

grant execute on function public.create_store_order(text, text, jsonb, jsonb, text, text, timestamptz) to anon, authenticated;
