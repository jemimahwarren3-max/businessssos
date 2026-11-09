insert into public.permissions (key, category, label)
values ('orders.manage', 'Online shop', 'View and manage online orders')
on conflict (key) do nothing;

insert into public.business_role_permissions (business_id, role, permission_key)
select seeded.business_id, roles.role_name, 'orders.manage'
from (select distinct business_id from public.business_role_permissions) seeded
cross join (values ('admin'::public.app_role), ('manager'::public.app_role)) roles(role_name)
on conflict (business_id, role, permission_key) do nothing;

create or replace function public.seed_default_role_permissions(_business_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.business_role_permissions where business_id = _business_id) then
    return;
  end if;
  insert into public.business_role_permissions (business_id, role, permission_key)
  select _business_id, d.role, d.permission_key from (values
    ('admin'::public.app_role, 'sales.create'), ('manager'::public.app_role, 'sales.create'), ('cashier'::public.app_role, 'sales.create'),
    ('admin'::public.app_role, 'sales.import'), ('manager'::public.app_role, 'sales.import'), ('accountant'::public.app_role, 'sales.import'),
    ('admin'::public.app_role, 'payments.record'), ('manager'::public.app_role, 'payments.record'), ('cashier'::public.app_role, 'payments.record'), ('accountant'::public.app_role, 'payments.record'),
    ('admin'::public.app_role, 'inventory.import'), ('manager'::public.app_role, 'inventory.import'),
    ('admin'::public.app_role, 'customers.create'), ('manager'::public.app_role, 'customers.create'), ('cashier'::public.app_role, 'customers.create'), ('accountant'::public.app_role, 'customers.create'),
    ('admin'::public.app_role, 'customers.import'), ('manager'::public.app_role, 'customers.import'), ('cashier'::public.app_role, 'customers.import'), ('accountant'::public.app_role, 'customers.import'),
    ('admin'::public.app_role, 'customers.order'), ('manager'::public.app_role, 'customers.order'), ('accountant'::public.app_role, 'customers.order'),
    ('admin'::public.app_role, 'suppliers.view'), ('manager'::public.app_role, 'suppliers.view'),
    ('admin'::public.app_role, 'suppliers.create'), ('manager'::public.app_role, 'suppliers.create'),
    ('admin'::public.app_role, 'suppliers.edit'), ('manager'::public.app_role, 'suppliers.edit'),
    ('admin'::public.app_role, 'suppliers.delete'), ('manager'::public.app_role, 'suppliers.delete'),
    ('admin'::public.app_role, 'purchase_orders.create'), ('manager'::public.app_role, 'purchase_orders.create'),
    ('admin'::public.app_role, 'invoices.manage'), ('manager'::public.app_role, 'invoices.manage'), ('accountant'::public.app_role, 'invoices.manage'),
    ('admin'::public.app_role, 'quotes.manage'), ('manager'::public.app_role, 'quotes.manage'), ('accountant'::public.app_role, 'quotes.manage'),
    ('admin'::public.app_role, 'expenses.create'), ('manager'::public.app_role, 'expenses.create'), ('accountant'::public.app_role, 'expenses.create'),
    ('admin'::public.app_role, 'expenses.delete'),
    ('admin'::public.app_role, 'expenses.import'), ('manager'::public.app_role, 'expenses.import'), ('accountant'::public.app_role, 'expenses.import'),
    ('admin'::public.app_role, 'reports.financial'), ('manager'::public.app_role, 'reports.financial'), ('accountant'::public.app_role, 'reports.financial'),
    ('admin'::public.app_role, 'ai.use'), ('manager'::public.app_role, 'ai.use'), ('accountant'::public.app_role, 'ai.use'),
    ('admin'::public.app_role, 'users.view'),
    ('admin'::public.app_role, 'users.invite'),
    ('admin'::public.app_role, 'users.manage'),
    ('admin'::public.app_role, 'users.remove'),
    ('admin'::public.app_role, 'roles.manage'),
    ('admin'::public.app_role, 'business.settings'),
    ('admin'::public.app_role, 'business.billing'),
    ('admin'::public.app_role, 'business.export_data'),
    ('admin'::public.app_role, 'orders.manage'),
    ('manager'::public.app_role, 'orders.manage')
  ) as d(role, permission_key);
end;
$$;
revoke all on function public.seed_default_role_permissions(uuid) from public;

create or replace function public.storefront_require_orders(_business_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_default_role_permissions(_business_id);
  if not public.has_permission(_business_id, 'orders.manage') then
    raise exception 'Your role does not allow this action.' using errcode = 'B0002';
  end if;
end;
$$;
revoke all on function public.storefront_require_orders(uuid) from public, anon;

create or replace function public.storefront_require_sales(_business_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.storefront_require_orders(_business_id);
end;
$$;
revoke all on function public.storefront_require_sales(uuid) from public, anon;

create or replace function public.get_storefront_admin(_business_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _payload jsonb;
begin
  perform public.storefront_require_settings(_business_id);
  _payload := public.get_storefront_admin_gallery_base(_business_id);
  if _payload is null then
    return null;
  end if;
  _payload := jsonb_set(
    _payload,
    '{categories}',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('id', category.id, 'name', category.name)
          order by category.name
        )
        from public.categories category
        where category.business_id = _business_id
      ),
      '[]'::jsonb
    ),
    true
  );
  return jsonb_set(
    _payload,
    '{products}',
    public.storefront_attach_product_media(
      public.storefront_apply_listing_names(_payload->'products', _business_id, true),
      _business_id
    ),
    true
  );
end;
$$;
revoke all on function public.get_storefront_admin(uuid) from public, anon;
grant execute on function public.get_storefront_admin(uuid) to authenticated;

create or replace function public.get_storefront_orders(_business_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _payload jsonb;
begin
  perform public.storefront_require_orders(_business_id);
  _payload := public.get_storefront_admin_gallery_base(_business_id);
  return coalesce(_payload->'orders', '[]'::jsonb);
end;
$$;
revoke all on function public.get_storefront_orders(uuid) from public, anon;
grant execute on function public.get_storefront_orders(uuid) to authenticated;

create or replace function public.get_store_order_admin(_business_id uuid, _order_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _order public.store_orders;
  _items jsonb;
  _events jsonb;
begin
  perform public.storefront_require_orders(_business_id);
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
revoke all on function public.get_store_order_admin(uuid, uuid) from public, anon;
grant execute on function public.get_store_order_admin(uuid, uuid) to authenticated;

create or replace function public.record_store_order_payment(
  _business_id uuid,
  _order_id uuid,
  _confirmation_reference text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _order public.store_orders;
  _result jsonb;
  _confirmation_reference_clean text;
begin
  perform public.storefront_require_orders(_business_id);
  perform public.storefront_require_payments(_business_id);
  if auth.uid() is null then
    raise exception 'Sign in to record a seller-confirmed payment.' using errcode = 'B0002';
  end if;

  select * into _order
  from public.store_orders
  where id = _order_id and business_id = _business_id
  for update;
  if not found then
    raise exception 'That order could not be found.' using errcode = 'B0001';
  end if;
  if _order.payment_method = 'paynow' then
    raise exception 'Paynow orders can only be marked paid after Paynow verification.'
      using errcode = 'B0001';
  end if;
  if _order.payment_method not in ('manual', 'pay_on_pickup', 'pay_on_delivery', 'quote') then
    raise exception 'This order does not support seller-confirmed payment.'
      using errcode = 'B0001';
  end if;
  if _order.fulfilment_status = 'cancelled'
     or _order.payment_status in ('cancelled', 'expired', 'refunded') then
    raise exception 'This order cannot accept a payment confirmation.'
      using errcode = 'B0001';
  end if;
  if _order.payment_status = 'paid' or _order.sale_id is not null then
    return public.get_store_order_admin(_business_id, _order_id);
  end if;
  if _order.payment_method = 'quote'
     and _order.fulfilment_status = 'awaiting_confirmation' then
    raise exception 'Accept the quote before recording payment.' using errcode = 'B0001';
  end if;

  _confirmation_reference_clean :=
    nullif(public.storefront_plain(_confirmation_reference, 80), '');
  _result := public.transition_store_order_legacy_20261023(
    _business_id, _order_id, 'mark_paid'
  );

  insert into public.store_order_payment_confirmations (
    business_id, order_id, payment_method, confirmation_reference,
    amount, currency, confirmed_by
  ) values (
    _business_id, _order_id, _order.payment_method, _confirmation_reference_clean,
    _order.total, _order.currency, auth.uid()
  );
  insert into public.store_order_events (business_id, order_id, event_type, message)
  values (
    _business_id, _order_id, 'seller_payment_confirmed',
    'Seller confirmed the payment after checking their own account or receiving cash. This is not provider-verified.'
  );
  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary)
  values (
    _business_id, auth.uid(), 'store_order.seller_payment_confirmed',
    'store_order', _order_id, 'Seller confirmed payment for ' || _order.reference
  );
  return _result;
end;
$$;
revoke all on function public.record_store_order_payment(uuid, uuid, text) from public, anon;
grant execute on function public.record_store_order_payment(uuid, uuid, text) to authenticated;

create or replace function public.reject_store_order_proof(
  _business_id uuid,
  _order_id uuid,
  _reason text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _order public.store_orders;
  _why text;
  _proof jsonb;
begin
  perform public.storefront_require_orders(_business_id);
  perform public.storefront_require_payments(_business_id);
  select * into _order from public.store_orders
    where id = _order_id and business_id = _business_id
    for update;
  if not found then
    raise exception 'That order could not be found.' using errcode = 'B0001';
  end if;
  if _order.payment_method <> 'manual' or _order.payment_status <> 'pending' then
    raise exception 'There is no payment note to reject on this order.' using errcode = 'B0001';
  end if;
  if _order.sale_id is not null or _order.payment_status = 'paid' then
    raise exception 'This order is already paid.' using errcode = 'B0001';
  end if;
  _why := coalesce(nullif(public.storefront_plain(_reason, 400), ''), 'The shop could not confirm this payment.');
  _proof := coalesce(_order.terms->'paymentProof', '{}'::jsonb)
    || jsonb_build_object('rejectedAt', now(), 'rejectReason', _why);
  update public.store_orders
    set payment_status = 'failed',
        terms = coalesce(terms, '{}'::jsonb) || jsonb_build_object('paymentProof', _proof)
    where id = _order.id;
  insert into public.store_order_events (business_id, order_id, event_type, message)
  values (
    _business_id, _order.id, 'proof_rejected',
    'Payment note rejected. Payment is still not recorded. ' || _why
  );
  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary)
  values (
    _business_id, auth.uid(), 'store_order.proof_rejected', 'store_order', _order.id,
    'Rejected payment note on ' || _order.reference
  );
  return public.get_store_order_admin(_business_id, _order_id);
end;
$$;
revoke all on function public.reject_store_order_proof(uuid, uuid, text) from public, anon;
grant execute on function public.reject_store_order_proof(uuid, uuid, text) to authenticated;
create or replace function public.has_permission(_business_id uuid, _permission text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  _role public.app_role;
begin
  select m.role into _role from public.business_members m
    where m.business_id = _business_id and m.user_id = auth.uid() and m.is_active;
  if _role is null then
    return false;
  end if;
  if _role = 'owner' then
    return true;
  end if;
  perform public.seed_default_role_permissions(_business_id);
  return exists (
    select 1 from public.business_role_permissions
    where business_id = _business_id and role = _role and permission_key = _permission
  );
end;
$$;
revoke all on function public.has_permission(uuid, text) from public;
grant execute on function public.has_permission(uuid, text) to authenticated, service_role;

do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'transition_store_order_impl'
  ) then
    alter function public.transition_store_order(uuid, uuid, text, text) rename to transition_store_order_impl;
  end if;
end $$;
revoke all on function public.transition_store_order_impl(uuid, uuid, text, text) from public, anon, authenticated;

create or replace function public.transition_store_order(
  _business_id uuid,
  _order_id uuid,
  _action text,
  _reason text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.storefront_require_orders(_business_id);
  return public.transition_store_order_impl(_business_id, _order_id, _action, _reason);
end;
$$;
revoke all on function public.transition_store_order(uuid, uuid, text, text) from public, anon;
grant execute on function public.transition_store_order(uuid, uuid, text, text) to authenticated, service_role;
