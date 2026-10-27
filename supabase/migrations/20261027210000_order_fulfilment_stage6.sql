-- Stage 6: cancel reasons, seller fulfilment notes, customer order timeline.

alter table public.store_orders
  add column if not exists seller_internal_note text;

create or replace function public.save_store_order_seller_note(
  _business_id uuid,
  _order_id uuid,
  _note text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _order public.store_orders;
  _clean text;
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
  _clean := nullif(public.storefront_plain(_note, 2000), '');
  update public.store_orders
  set seller_internal_note = _clean
  where id = _order_id;
  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary)
  values (
    _business_id, auth.uid(), 'store_order.note', 'store_order', _order_id,
    'Updated internal note on ' || _order.reference
  );
  return public.get_store_order_admin(_business_id, _order_id);
end;
$$;

revoke all on function public.save_store_order_seller_note(uuid, uuid, text) from public, anon;
grant execute on function public.save_store_order_seller_note(uuid, uuid, text) to authenticated;

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
    'items', _items,
    'events', _events,
    'terms', coalesce(_order.terms, '{}'::jsonb)
  );
end;
$$;

create or replace function public.get_store_order(
  _slug text,
  _reference text,
  _token text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _store public.storefronts;
  _order public.store_orders;
  _items jsonb;
  _events jsonb;
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

  select coalesce(jsonb_agg(jsonb_build_object(
    'eventType', event_type,
    'message', message,
    'createdAt', created_at
  ) order by created_at), '[]'::jsonb) into _events
  from public.store_order_events
  where order_id = _order.id
    and event_type not in ('seller_payment_confirmed');

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
    'events', _events,
    'paid', _order.payment_status = 'paid',
    'revenueRecorded', _order.sale_id is not null,
    'terms', coalesce(_order.terms, '{}'::jsonb),
    'mine', _order.shopper_user_id is not null and _order.shopper_user_id = auth.uid()
  );
end;
$$;

drop function if exists public.transition_store_order(uuid, uuid, text);

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
  if _action = 'cancel' then
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

revoke all on function public.transition_store_order(uuid, uuid, text, text) from public, anon;
grant execute on function public.transition_store_order(uuid, uuid, text, text) to authenticated;
