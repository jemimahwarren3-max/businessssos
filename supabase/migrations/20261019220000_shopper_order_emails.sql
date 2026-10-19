-- Shopper receipts and status emails share the merchant notification
-- outbox. Rows without a notification_id are shopper mail and may only
-- be claimed by the service role. Access codes appear only on the
-- placed-order message (plaintext exists solely inside create_store_order).
-- Status events never include the code. Messages stay pending until
-- Resend is configured; they are not marked skipped.

alter table public.notification_outbox
  alter column notification_id drop not null;

create or replace function public.enqueue_shopper_order_email(
  _order_id uuid,
  _kind text,
  _access_token text default null,
  _event_id uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  _order public.store_orders;
  _store public.storefronts;
  _event public.store_order_events;
  _subject text;
  _body text;
  _key text;
  _email text;
begin
  if _kind not in ('placed', 'status') then
    return;
  end if;

  select * into _order from public.store_orders where id = _order_id;
  if not found then
    return;
  end if;

  _email := nullif(lower(btrim(coalesce(_order.customer_email, ''))), '');
  if _email is null or _email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return;
  end if;

  select * into _store from public.storefronts where business_id = _order.business_id limit 1;
  if not found then
    return;
  end if;

  if _kind = 'placed' then
    _key := _order.id::text || ':shopper:placed';
    _subject := 'Order ' || _order.reference || ' at ' || left(_store.store_name, 60);
    _body :=
      'Hello ' || coalesce(_order.customer_name, '') || ',' || e'\n\n' ||
      'This is a receipt for order ' || _order.reference || ' at ' || _store.store_name || '.' || e'\n' ||
      'Total: ' || _order.currency || ' ' || trim(both from to_char(_order.total, 'FM999999990.00')) || e'\n' ||
      'Fulfilment: ' || coalesce(_order.fulfilment_method, '') || e'\n' ||
      'Payment: ' || coalesce(_order.payment_method, '') || ' (' || coalesce(_order.payment_status, '') || ').' || e'\n' ||
      case
        when _access_token is not null and length(_access_token) >= 8 then
          e'\nAccess code (shown once): ' || _access_token || e'\n' ||
          'Use /store/' || _store.slug || '/order/' || _order.reference ||
          ' with this code if you are not signed in.' || e'\n'
        else e'\n'
      end ||
      e'\nThis is a transactional message for an order you placed. It is not marketing.' || e'\n' ||
      'Keep the access code private.';
  else
    if _event_id is null then
      return;
    end if;
    select * into _event from public.store_order_events
      where id = _event_id and order_id = _order_id;
    if not found or _event.event_type = 'created' then
      return;
    end if;
    _key := _order.id::text || ':shopper:event:' || _event.id::text;
    _subject := 'Update on order ' || _order.reference || ' at ' || left(_store.store_name, 60);
    _body :=
      'Hello ' || coalesce(_order.customer_name, '') || ',' || e'\n\n' ||
      'Update on order ' || _order.reference || ' at ' || _store.store_name || ':' || e'\n\n' ||
      coalesce(_event.message, _event.event_type) || e'\n\n' ||
      'Current fulfilment: ' || coalesce(_order.fulfilment_status, '') || e'\n' ||
      'Payment: ' || coalesce(_order.payment_status, '') || e'\n\n' ||
      'This is a transactional update for an order you placed. It is not marketing.' || e'\n' ||
      'The access code is not repeated here.';
  end if;

  insert into public.notification_outbox (
    business_id, notification_id, channel, to_email, subject, body, idempotency_key
  ) values (
    _order.business_id,
    null,
    'email',
    _email,
    left(_subject, 120),
    _body,
    _key
  )
  on conflict (idempotency_key) do nothing;
end;
$$;

create or replace function public.enqueue_shopper_status_email()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.event_type = 'created' then
    return new;
  end if;
  perform public.enqueue_shopper_order_email(new.order_id, 'status', null, new.id);
  return new;
end;
$$;

drop trigger if exists store_order_events_shopper_email on public.store_order_events;
create trigger store_order_events_shopper_email
  after insert on public.store_order_events
  for each row execute function public.enqueue_shopper_status_email();

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
    _name || ' · ' || _priced->>'currency' || ' ' || (_priced->>'total'),
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

create or replace function public.claim_notification_outbox(_business_id uuid, _limit integer)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _cap integer;
begin
  if not public.is_business_member(_business_id) then
    raise exception 'You do not have access to this business.' using errcode = 'B0002';
  end if;
  _cap := least(greatest(coalesce(_limit, 10), 1), 25);
  return coalesce((
    with picked as (
      select o.id
      from public.notification_outbox o
      where o.business_id = _business_id
        and o.notification_id is not null
        and (
          (o.status = 'pending' and o.available_at <= now())
          or (o.status = 'sending' and o.available_at < now() - interval '10 minutes')
        )
      order by o.created_at
      limit _cap
      for update skip locked
    ),
    updated as (
      update public.notification_outbox o
      set status = 'sending', attempts = o.attempts + 1, available_at = now()
      from picked
      where o.id = picked.id
      returning o.id, o.to_email, o.subject, o.body, o.attempts, o.notification_id
    )
    select jsonb_agg(jsonb_build_object(
      'id', u.id,
      'toEmail', u.to_email,
      'subject', u.subject,
      'body', u.body,
      'attempts', u.attempts,
      'notificationId', u.notification_id
    ))
    from updated u
  ), '[]'::jsonb);
end;
$$;

create or replace function public.claim_notification_outbox_admin(_limit integer)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _cap integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Not allowed.' using errcode = 'B0002';
  end if;
  _cap := least(greatest(coalesce(_limit, 10), 1), 25);
  return coalesce((
    with picked as (
      select o.id
      from public.notification_outbox o
      where (
          (o.status = 'pending' and o.available_at <= now())
          or (o.status = 'sending' and o.available_at < now() - interval '10 minutes')
        )
      order by o.created_at
      limit _cap
      for update skip locked
    ),
    updated as (
      update public.notification_outbox o
      set status = 'sending', attempts = o.attempts + 1, available_at = now()
      from picked
      where o.id = picked.id
      returning o.id, o.to_email, o.subject, o.body, o.attempts, o.notification_id
    )
    select jsonb_agg(jsonb_build_object(
      'id', u.id,
      'toEmail', u.to_email,
      'subject', u.subject,
      'body', u.body,
      'attempts', u.attempts,
      'notificationId', u.notification_id
    ))
    from updated u
  ), '[]'::jsonb);
end;
$$;

create or replace function public.complete_notification_outbox(
  _id uuid,
  _status text,
  _error text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  _row public.notification_outbox;
  _next timestamptz;
begin
  if _status not in ('sent', 'failed', 'skipped') then
    raise exception 'That delivery status is not valid.' using errcode = 'B0001';
  end if;
  select * into _row from public.notification_outbox where id = _id;
  if not found then
    raise exception 'That delivery could not be found.' using errcode = 'B0001';
  end if;
  if auth.role() <> 'service_role' then
    if _row.notification_id is null or not public.is_business_member(_row.business_id) then
      raise exception 'You do not have access to this business.' using errcode = 'B0002';
    end if;
  end if;

  if _status = 'failed' and _row.attempts < 8 then
    _next := now() + (interval '1 minute' * (2 ^ least(_row.attempts, 6)));
    update public.notification_outbox
      set status = 'pending', last_error = nullif(_error, ''), available_at = _next
      where id = _id;
    return;
  end if;

  update public.notification_outbox
    set
      status = _status,
      last_error = nullif(_error, ''),
      sent_at = case when _status = 'sent' then now() else sent_at end
    where id = _id;
end;
$$;

revoke all on function public.enqueue_shopper_order_email(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.enqueue_shopper_status_email() from public;
grant execute on function public.enqueue_shopper_order_email(uuid, text, text, uuid) to service_role;
grant execute on function public.claim_notification_outbox(uuid, integer) to authenticated;
grant execute on function public.complete_notification_outbox(uuid, text, text) to authenticated, service_role;
grant execute on function public.claim_notification_outbox_admin(integer) to service_role;
grant execute on function public.create_store_order(text, text, jsonb, jsonb, text, text, timestamptz) to anon, authenticated;
