-- Shopper accounts: optional login on a shop, order history by user id,
-- and per-shop message consent. Guest checkout and access codes stay valid.
-- Matching email alone never attaches an order.

alter table public.store_orders
  add column if not exists shopper_user_id uuid references auth.users(id) on delete set null;

create index if not exists store_orders_shopper_idx
  on public.store_orders (shopper_user_id, business_id, created_at desc)
  where shopper_user_id is not null;

create table if not exists public.shopper_shop_consents (
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  messages boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, business_id)
);
create index if not exists shopper_shop_consents_business_idx
  on public.shopper_shop_consents (business_id, messages);
create trigger shopper_shop_consents_updated before update on public.shopper_shop_consents
  for each row execute function public.set_updated_at();

alter table public.shopper_shop_consents enable row level security;
grant select, insert, update on public.shopper_shop_consents to authenticated;
grant all on public.shopper_shop_consents to service_role;

drop policy if exists shopper_shop_consents_own on public.shopper_shop_consents;
create policy shopper_shop_consents_own on public.shopper_shop_consents
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists shopper_shop_consents_member_read on public.shopper_shop_consents;
create policy shopper_shop_consents_member_read on public.shopper_shop_consents
  for select to authenticated
  using (public.is_business_member(business_id));

create or replace function public.storefront_can_access_order(
  _order public.store_orders,
  _token text
) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(_token, '') <> ''
     and _order.token_hash is not null
     and _order.token_hash = extensions.crypt(_token, _order.token_hash) then
    return true;
  end if;
  if auth.uid() is not null and _order.shopper_user_id = auth.uid() then
    return true;
  end if;
  return false;
end;
$$;

create or replace function public.storefront_upsert_shopper_consent(
  _business_id uuid,
  _messages boolean
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return;
  end if;
  insert into public.shopper_shop_consents (user_id, business_id, messages)
  values (auth.uid(), _business_id, coalesce(_messages, false))
  on conflict (user_id, business_id) do update
    set messages = excluded.messages;
end;
$$;

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
  if not found or not public.storefront_can_access_order(_order, _token) then
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
    'terms', coalesce(_order.terms, '{}'::jsonb),
    'mine', _order.shopper_user_id is not null and _order.shopper_user_id = auth.uid()
  );
end;
$$;

create or replace function public.create_store_review(
  _slug text,
  _reference text,
  _token text,
  _product_id uuid,
  _rating integer,
  _body text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _store public.storefronts;
  _order public.store_orders;
  _item public.store_order_items;
  _name text;
  _text text;
  _id uuid;
begin
  if not public.check_rate_limit('store-review:' || coalesce(_slug, ''), 8, 60) then
    raise exception 'Too many reviews just now. Please wait a minute and try again.' using errcode = 'B0001';
  end if;
  select * into _store from public.storefronts where slug = lower(coalesce(_slug, '')) and status = 'published';
  if not found then
    raise exception 'This shop is not available.' using errcode = 'B0001';
  end if;
  select * into _order from public.store_orders
    where business_id = _store.business_id and reference = upper(btrim(coalesce(_reference, '')));
  if not found or not public.storefront_can_access_order(_order, _token) then
    raise exception 'That order could not be matched. Check the access code.' using errcode = 'B0001';
  end if;
  if not public.storefront_review_eligible(_order) then
    raise exception 'Reviews are only accepted after the shop marks the order ready, out for delivery, or completed. Quote requests cannot be reviewed.' using errcode = 'B0001';
  end if;
  if _rating is null or _rating < 1 or _rating > 5 then
    raise exception 'Choose a rating from 1 to 5.' using errcode = 'B0001';
  end if;
  select * into _item from public.store_order_items
    where order_id = _order.id and product_id = _product_id;
  if not found then
    raise exception 'That product was not on this order.' using errcode = 'B0001';
  end if;
  _text := public.storefront_plain(_body, 1000);
  if _text is null or length(_text) < 8 then
    raise exception 'Write a short review of what you received.' using errcode = 'B0001';
  end if;
  _name := public.storefront_plain(split_part(btrim(_order.customer_name), ' ', 1), 40);
  if _name is null or length(_name) < 2 then
    _name := 'Customer';
  end if;

  insert into public.store_reviews (
    business_id, product_id, order_id, rating, body, display_name
  ) values (
    _store.business_id, _product_id, _order.id, _rating, _text, _name
  ) returning id into _id;

  insert into public.notifications (business_id, type, title, message, severity, link)
  values (
    _store.business_id, 'store_review', 'Verified purchase review',
    _name || ' reviewed a product', 'info', '/storefront'
  );

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary)
  values (_store.business_id, auth.uid(), 'store_review.created', 'store_review', _id, 'Verified purchase review');

  return jsonb_build_object('id', _id, 'status', 'published');
exception
  when unique_violation then
    raise exception 'You already reviewed this item on this order.' using errcode = 'B0001';
end;
$$;

create or replace function public.create_store_complaint(
  _slug text,
  _customer jsonb,
  _message text,
  _reference text default null,
  _token text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _store public.storefronts;
  _order public.store_orders;
  _order_id uuid;
  _name text;
  _phone text;
  _email text;
  _body text;
  _id uuid;
begin
  if not public.check_rate_limit('store-complaint:' || coalesce(_slug, ''), 8, 60) then
    raise exception 'Too many reports just now. Please wait a minute and try again.' using errcode = 'B0001';
  end if;
  select * into _store from public.storefronts where slug = lower(coalesce(_slug, '')) and status = 'published';
  if not found then
    raise exception 'This shop is not available.' using errcode = 'B0001';
  end if;

  _name := public.storefront_plain(_customer->>'name', 80);
  _phone := regexp_replace(coalesce(_customer->>'phone', ''), '[^0-9+]', '', 'g');
  _email := nullif(public.storefront_plain(_customer->>'email', 120), '');
  _body := public.storefront_plain(_message, 2000);
  if _name is null or length(_name) < 2 then
    raise exception 'Enter your name.' using errcode = 'B0001';
  end if;
  if length(regexp_replace(_phone, '\D', '', 'g')) < 7 then
    raise exception 'Enter a phone number the shop can use.' using errcode = 'B0001';
  end if;
  if _body is null or length(_body) < 8 then
    raise exception 'Describe the problem in a bit more detail.' using errcode = 'B0001';
  end if;

  if nullif(btrim(coalesce(_reference, '')), '') is not null then
    select * into _order from public.store_orders
      where business_id = _store.business_id and reference = upper(btrim(_reference));
    if not found or not public.storefront_can_access_order(_order, _token) then
      raise exception 'That order could not be matched. Check the access code.' using errcode = 'B0001';
    end if;
    _order_id := _order.id;
  end if;

  insert into public.store_complaints (
    business_id, order_id, customer_name, customer_phone, customer_email, message
  ) values (
    _store.business_id, _order_id, _name, _phone, _email, _body
  ) returning id into _id;

  insert into public.notifications (business_id, type, title, message, severity, link)
  values (
    _store.business_id, 'store_complaint', 'Customer complaint',
    _name || ' reported a problem', 'warning', '/storefront'
  );

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary)
  values (_store.business_id, auth.uid(), 'store_complaint.created', 'store_complaint', _id, 'Customer complaint');

  return jsonb_build_object('id', _id, 'status', 'open');
end;
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
    'fulfilmentMethod', o.fulfilment_method,
    'collectAt', o.collect_at
  ) order by o.created_at desc), '[]'::jsonb) into _orders
  from public.store_orders o
  where o.business_id = _store.business_id and o.shopper_user_id = auth.uid();
  return jsonb_build_object('messagesConsent', coalesce(_consent, false), 'orders', _orders);
end;
$$;

create or replace function public.claim_store_order(_slug text, _reference text, _token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _store public.storefronts;
  _order public.store_orders;
begin
  if auth.uid() is null then
    raise exception 'Sign in to save this order to your account.' using errcode = 'B0002';
  end if;
  if not public.check_rate_limit('shopper-claim:' || auth.uid()::text, 10, 60) then
    raise exception 'Too many attempts. Please wait a moment and try again.' using errcode = 'B0001';
  end if;
  select * into _store from public.storefronts where slug = lower(coalesce(_slug, ''));
  if not found then
    raise exception 'That order could not be found.' using errcode = 'B0001';
  end if;
  select * into _order from public.store_orders
    where business_id = _store.business_id and reference = upper(btrim(coalesce(_reference, '')));
  if not found
     or _token is null
     or _order.token_hash <> extensions.crypt(_token, _order.token_hash) then
    raise exception 'That order could not be found.' using errcode = 'B0001';
  end if;
  if _order.shopper_user_id is not null and _order.shopper_user_id <> auth.uid() then
    raise exception 'That order is already saved to another account.' using errcode = 'B0001';
  end if;
  if _order.shopper_user_id is null then
    update public.store_orders set shopper_user_id = auth.uid() where id = _order.id;
    insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary)
    values (_store.business_id, auth.uid(), 'store_order.claimed', 'store_order', _order.id, 'Shopper claimed ' || _order.reference);
  end if;
  return public.get_store_order(_slug, _reference, _token);
end;
$$;

create or replace function public.set_shopper_consent(_slug text, _messages boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _store public.storefronts;
begin
  if auth.uid() is null then
    raise exception 'Sign in to update your preferences.' using errcode = 'B0002';
  end if;
  select * into _store from public.storefronts where slug = lower(coalesce(_slug, ''));
  if not found then
    raise exception 'This shop is not available.' using errcode = 'B0001';
  end if;
  perform public.storefront_upsert_shopper_consent(_store.business_id, coalesce(_messages, false));
  return public.get_shopper_account(_slug);
end;
$$;

revoke all on function public.storefront_can_access_order(public.store_orders, text) from public, anon, authenticated;
revoke all on function public.storefront_upsert_shopper_consent(uuid, boolean) from public, anon, authenticated;
revoke all on function public.get_shopper_account(text) from public, anon;
revoke all on function public.claim_store_order(text, text, text) from public, anon;
revoke all on function public.set_shopper_consent(text, boolean) from public, anon;

grant execute on function public.get_shopper_account(text) to authenticated;
grant execute on function public.claim_store_order(text, text, text) to authenticated;
grant execute on function public.set_shopper_consent(text, boolean) to authenticated;
grant execute on function public.create_store_order(text, text, jsonb, jsonb, text, text, timestamptz) to anon, authenticated;
grant execute on function public.get_store_order(text, text, text) to anon, authenticated;
grant execute on function public.create_store_review(text, text, text, uuid, integer, text) to anon, authenticated;
grant execute on function public.create_store_complaint(text, jsonb, text, text, text) to anon, authenticated;
