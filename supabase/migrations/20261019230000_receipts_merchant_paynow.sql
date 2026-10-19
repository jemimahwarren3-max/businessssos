-- Customer receipts stay the same document the merchant sees.
-- Merchants link THEIR Paynow integration (never platform billing keys).
-- Close the storefront_record_sale grant leak (revoke anon/authenticated).

create table if not exists public.store_paynow_credentials (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  ciphertext text not null,
  updated_at timestamptz not null default now()
);
alter table public.store_paynow_credentials enable row level security;
revoke all on public.store_paynow_credentials from public, anon, authenticated;
grant all on public.store_paynow_credentials to service_role;

create table if not exists public.shop_order_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_id uuid not null references public.store_orders(id) on delete cascade,
  reference text not null unique,
  poll_url text not null,
  status text not null default 'created'
    check (status in ('created', 'paid', 'failed')),
  amount numeric(14,2) not null,
  currency text not null,
  channel text not null check (channel in ('web', 'ecocash')),
  provider_reference text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists shop_order_payments_order_idx on public.shop_order_payments (order_id);
alter table public.shop_order_payments enable row level security;
revoke all on public.shop_order_payments from public, anon, authenticated;
grant all on public.shop_order_payments to service_role;
create policy "members read shop order payments"
  on public.shop_order_payments for select to authenticated
  using (public.is_business_member(business_id));
grant select on public.shop_order_payments to authenticated;

create or replace function public.shop_offers_paynow(_slug text)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  _store public.storefronts;
begin
  select * into _store from public.storefronts where slug = lower(coalesce(_slug, ''));
  if not found then
    return false;
  end if;
  if coalesce((_store.payments->>'acceptPaynow')::boolean, false) is not true then
    return false;
  end if;
  return exists (
    select 1 from public.store_paynow_credentials c where c.business_id = _store.business_id
  );
end;
$$;

create or replace function public.shop_offers_paynow_business(_business_id uuid)
returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_business_member(_business_id) then
    return false;
  end if;
  return exists (
    select 1 from public.store_paynow_credentials c where c.business_id = _business_id
  );
end;
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
    'acceptPaynow', coalesce((_raw->>'acceptPaynow')::boolean, false),
    'paynow', false,
    'cashCurrencies', left(btrim(coalesce(nullif(_raw->>'cashCurrencies', ''), '')), 40),
    'exactCash', coalesce((_raw->>'exactCash')::boolean, false),
    'changeProvided', coalesce((_raw->>'changeProvided')::boolean, false)
      and coalesce((_raw->>'exactCash')::boolean, false) is not true
  );
$$;

create or replace function public.get_shopper_account(_slug text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _store public.storefronts;
  _orders jsonb;
  _consent boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Sign in to see your orders.' using errcode = 'B0002';
  end if;
  if not public.check_rate_limit('shopper-account:' || auth.uid()::text, 30, 60) then
    raise exception 'Too many attempts. Please wait a moment and try again.' using errcode = 'B0001';
  end if;
  select * into _store from public.storefronts where slug = lower(coalesce(_slug, ''));
  if not found then
    raise exception 'This shop is not available.' using errcode = 'B0001';
  end if;
  select coalesce(messages, false) into _consent
    from public.shopper_shop_consents
    where user_id = auth.uid() and business_id = _store.business_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'reference', o.reference,
    'createdAt', o.created_at,
    'total', o.total,
    'currency', o.currency,
    'fulfilmentStatus', o.fulfilment_status,
    'paymentStatus', o.payment_status,
    'paymentMethod', o.payment_method,
    'fulfilmentMethod', o.fulfilment_method,
    'itemSummary', (
      select string_agg(trim(both from to_char(i.quantity, 'FM999999990.###')) || ' × ' || i.name, ', ' order by i.name)
      from public.store_order_items i where i.order_id = o.id
    ),
    'collectAt', o.collect_at
  ) order by o.created_at desc), '[]'::jsonb) into _orders
  from public.store_orders o
  where o.business_id = _store.business_id and o.shopper_user_id = auth.uid();
  return jsonb_build_object('messagesConsent', coalesce(_consent, false), 'orders', _orders);
end;
$$;

create or replace function public.confirm_shop_paynow_payment(
  _reference text,
  _provider_reference text,
  _raw_status text,
  _paid boolean
) returns void
language plpgsql security definer set search_path = public as $$
declare
  _row public.shop_order_payments;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Not allowed.' using errcode = 'B0002';
  end if;
  select * into _row from public.shop_order_payments where reference = _reference for update;
  if not found then
    raise exception 'Unknown payment reference.' using errcode = 'B0001';
  end if;
  if _row.status <> 'created' then
    return;
  end if;
  if _paid then
    update public.shop_order_payments
      set status = 'paid',
          provider_reference = coalesce(_provider_reference, provider_reference),
          paid_at = now()
      where id = _row.id;
    perform public.storefront_record_sale(_row.order_id);
    insert into public.store_order_events (business_id, order_id, event_type, message)
    values (
      _row.business_id, _row.order_id, 'paid',
      'Paynow payment recorded. This is the same receipt the customer sees.'
    );
  else
    update public.shop_order_payments
      set status = 'failed',
          provider_reference = coalesce(_provider_reference, provider_reference)
      where id = _row.id;
    insert into public.store_order_events (business_id, order_id, event_type, message)
    values (
      _row.business_id, _row.order_id, 'payment_failed',
      'Paynow did not complete this payment. The order is still unpaid.'
    );
  end if;
end;
$$;

revoke all on function public.shop_offers_paynow(text) from public;
revoke all on function public.shop_offers_paynow_business(uuid) from public, anon;
revoke all on function public.confirm_shop_paynow_payment(text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.shop_offers_paynow(text) to anon, authenticated, service_role;
grant execute on function public.shop_offers_paynow_business(uuid) to authenticated;
grant execute on function public.confirm_shop_paynow_payment(text, text, text, boolean) to service_role;
grant execute on function public.get_shopper_account(text) to authenticated;

revoke all on function public.storefront_record_sale(uuid) from public, anon, authenticated;
revoke all on function public.storefront_restore_stock(uuid) from public, anon, authenticated;
grant execute on function public.storefront_record_sale(uuid) to service_role;
grant execute on function public.storefront_restore_stock(uuid) to service_role;
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
  if _payment_method not in ('pay_on_pickup', 'pay_on_delivery', 'quote', 'paynow') then
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

create or replace function public.storefront_paynow_context(_slug text)
returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object('businessId', s.business_id, 'storeName', s.store_name)
  from public.storefronts s
  where s.slug = lower(coalesce(_slug, ''))
  limit 1
$$;
revoke all on function public.storefront_paynow_context(text) from public, anon, authenticated;
grant execute on function public.storefront_paynow_context(text) to service_role;

create or replace function public.storefront_order_id(_slug text, _reference text)
returns uuid
language sql security definer set search_path = public as $$
  select o.id
  from public.store_orders o
  join public.storefronts s on s.business_id = o.business_id
  where s.slug = lower(coalesce(_slug, ''))
    and o.reference = upper(btrim(coalesce(_reference, '')))
  limit 1
$$;
revoke all on function public.storefront_order_id(text, text) from public, anon, authenticated;
grant execute on function public.storefront_order_id(text, text) to service_role;

-- Record online Paynow as mobile money, cash otherwise. Belt: members need payments.record.
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
  if not found then
    raise exception 'That order could not be found.' using errcode = 'B0001';
  end if;
  if auth.role() = 'authenticated' and not public.has_permission(_order.business_id, 'payments.record') then
    raise exception 'You do not have permission to record payment.' using errcode = 'B0002';
  end if;
  if _order.sale_id is not null then
    return _order.sale_id;
  end if;
  _method := case
    when _order.payment_method = 'paynow' then 'mobile_money'::public.payment_method
    else 'cash'::public.payment_method
  end;

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

revoke all on function public.storefront_record_sale(uuid) from public, anon, authenticated;
grant execute on function public.storefront_record_sale(uuid) to service_role;

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
      (select count(*) from public.store_order_items i where i.order_id = so.id) as "itemCount",
      (
        select string_agg(trim(both from to_char(i.quantity, 'FM999999990.###')) || ' × ' || i.name, ', ' order by i.name)
        from public.store_order_items i where i.order_id = so.id
      ) as "itemSummary"
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
        or coalesce((_store.payments->>'quotes')::boolean, false)
        or coalesce((_store.payments->>'acceptPaynow')::boolean, false),
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
