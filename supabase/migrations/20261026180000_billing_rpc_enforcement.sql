-- Server-side subscription enforcement inside SECURITY DEFINER RPCs so direct
-- Supabase clients cannot bypass Node assertCanOperate / assertCanPublish.
--
-- Mirror Cloud Run BILLING_ENABLED: set billing_enforced = true when turning
-- on paid enforcement in production (keep false on free-beta staging).
create table if not exists public.platform_runtime (
  id int primary key check (id = 1),
  billing_enforced boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.platform_runtime (id, billing_enforced)
values (1, false)
on conflict (id) do nothing;

alter table public.platform_runtime enable row level security;
revoke all on public.platform_runtime from public, anon, authenticated;
grant select, update on public.platform_runtime to service_role;

create or replace function public.platform_billing_enforced()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select billing_enforced from public.platform_runtime where id = 1),
    false
  );
$$;
revoke all on function public.platform_billing_enforced() from public, anon;
grant execute on function public.platform_billing_enforced() to authenticated, service_role;

create or replace function public.business_can_operate(_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.subscriptions s
    where s.business_id = _business_id
      and (
        s.status = 'active'
        or (
          s.status = 'past_due'
          and s.current_period_end is not null
          and s.current_period_end > now()
        )
      )
  );
$$;
revoke all on function public.business_can_operate(uuid) from public, anon;
grant execute on function public.business_can_operate(uuid) to authenticated, service_role;

create or replace function public.assert_business_can_operate(_business_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.platform_billing_enforced() then
    return;
  end if;
  if public.has_platform_subscription_bypass() then
    return;
  end if;
  if not public.business_can_operate(_business_id) then
    raise exception
      'An active subscription is required for this action. Pay for your plan under Settings → Billing.'
      using errcode = 'B0002';
  end if;
end;
$$;
revoke all on function public.assert_business_can_operate(uuid) from public, anon;
grant execute on function public.assert_business_can_operate(uuid) to authenticated, service_role;

-- ============ guarded RPCs ============

create or replace function public.create_sale(
  _business_id uuid,
  _customer_id uuid,
  _discount numeric,
  _payment_method public.payment_method,
  _notes text,
  _items jsonb,
  _idempotency_key text default null,
  _location_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _sale_id uuid;
  _seq int;
  _number text;
  _subtotal numeric(14,2) := 0;
  _tax numeric(14,2) := 0;
  _cost_total numeric(14,2) := 0;
  _total numeric(14,2);
  _item jsonb;
  _product public.products;
  _qty numeric(14,3);
  _price numeric(14,2);
  _line_subtotal numeric(14,2);
  _line_tax numeric(14,2);
  _stock_before numeric(14,3);
  _stock_after numeric(14,3);
  _allow_negative boolean;
  _resolved_location uuid;
  _cash_session uuid;
begin
  if not public.has_permission(_business_id, 'sales.create') then
    raise exception 'You do not have permission to record sales.' using errcode = 'B0002';
  end if;
  perform public.assert_business_can_operate(_business_id);
  if _items is null or jsonb_array_length(_items) = 0 then
    raise exception 'A sale needs at least one item.' using errcode = 'B0001';
  end if;
  if _discount is null or _discount < 0 then
    raise exception 'Discount cannot be negative.' using errcode = 'B0001';
  end if;
  if _payment_method = 'credit' and _customer_id is null then
    raise exception 'Select a customer for credit sales.' using errcode = 'B0001';
  end if;
  if _customer_id is not null and not exists (
    select 1 from public.customers where id = _customer_id and business_id = _business_id and deleted_at is null
  ) then
    raise exception 'That customer could not be found.' using errcode = 'B0001';
  end if;

  if _idempotency_key is not null then
    select id into _sale_id from public.sales
      where business_id = _business_id and idempotency_key = _idempotency_key limit 1;
    if found then
      return _sale_id;
    end if;
  end if;

  if _payment_method = 'cash' then
    _cash_session := public.cash_open_session_id(_business_id);
    if _cash_session is null then
      raise exception 'Open the cash drawer before taking cash.' using errcode = 'B0001';
    end if;
  end if;

  _resolved_location := public.resolve_location_id(_business_id, _location_id);
  select allow_negative_stock into _allow_negative from public.business_settings where business_id = _business_id;

  insert into public.business_counters (business_id) values (_business_id)
    on conflict (business_id) do nothing;
  update public.business_counters set sale_seq = sale_seq + 1
    where business_id = _business_id returning sale_seq into _seq;
  _number := 'S-' || lpad(_seq::text, 4, '0');

  insert into public.sales (business_id, sale_number, customer_id, payment_method, status, notes, created_by, idempotency_key, location_id, cash_session_id)
  values (_business_id, _number, _customer_id, _payment_method, 'completed', nullif(trim(_notes), ''), auth.uid(), _idempotency_key, _resolved_location, _cash_session)
  returning id into _sale_id;

  for _item in select * from jsonb_array_elements(_items)
  loop
    _qty := (_item->>'quantity')::numeric;
    if _qty is null or _qty <= 0 then
      raise exception 'Item quantity must be greater than zero.' using errcode = 'B0001';
    end if;

    select * into _product from public.products
      where id = nullif(_item->>'productId', '')::uuid and business_id = _business_id and deleted_at is null
      for update;
    if not found then
      raise exception 'One of the items in this sale could not be found.' using errcode = 'B0001';
    end if;

    _price := _product.selling_price;
    if _price < 0 then
      raise exception 'Item price cannot be negative.' using errcode = 'B0001';
    end if;

    _stock_before := public.get_location_stock(_product.id, _resolved_location);
    _stock_after := _stock_before - _qty;
    if _stock_after < 0 and not coalesce(_allow_negative, false) then
      raise exception 'Not enough stock for %. Only % left.', _product.name, _stock_before using errcode = 'B0001';
    end if;

    _line_subtotal := round(_qty * _price, 2);
    _line_tax := round(_line_subtotal * coalesce(_product.tax_rate, 0) / 100, 2);

    insert into public.sale_items (
      business_id, sale_id, product_id, name, sku, quantity, unit_price, cost_price, discount, tax, line_total
    ) values (
      _business_id, _sale_id, _product.id, _product.name, _product.sku, _qty, _price,
      _product.cost_price, 0, _line_tax, _line_subtotal + _line_tax
    );

    perform public.apply_stock_delta(_business_id, _product.id, _resolved_location, -_qty);
    insert into public.inventory_movements (
      business_id, product_id, location_id, movement_type, quantity, stock_before, stock_after, reference_type, reference_id, created_by
    ) values (
      _business_id, _product.id, _resolved_location, 'sale', -_qty, _stock_before, _stock_after, 'sale', _sale_id, auth.uid()
    );

    _subtotal := _subtotal + _line_subtotal;
    _tax := _tax + _line_tax;
    _cost_total := _cost_total + round(_qty * _product.cost_price, 2);
  end loop;

  if _discount > _subtotal then
    raise exception 'Discount cannot be more than the items total.' using errcode = 'B0001';
  end if;

  _total := greatest(_subtotal - _discount + _tax, 0);

  if _payment_method = 'credit' then
    update public.sales
      set subtotal = _subtotal, tax = _tax, total = _total, cost_total = _cost_total, discount = _discount, amount_paid = 0
      where id = _sale_id;
    if _customer_id is not null then
      update public.customers set outstanding_balance = outstanding_balance + _total where id = _customer_id;
    end if;
  else
    update public.sales
      set subtotal = _subtotal, tax = _tax, total = _total, cost_total = _cost_total, discount = _discount, amount_paid = _total
      where id = _sale_id;
    insert into public.payments (business_id, customer_id, sale_id, amount, method, created_by)
    values (_business_id, _customer_id, _sale_id, _total, _payment_method, auth.uid());
  end if;

  if _payment_method = 'cash' then
    perform public.cash_post_movement(_business_id, 'cash_sale', _total, 'sale', _sale_id, _number);
  end if;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary, new_values)
  values (_business_id, auth.uid(), 'sale.created', 'sale', _sale_id,
    'Recorded sale ' || _number, jsonb_build_object('total', _total, 'payment_method', _payment_method));

  return _sale_id;
end;
$$;

create or replace function public.open_cash_session(
  _business_id uuid,
  _opening_float numeric,
  _note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _id uuid;
begin
  if not public.has_business_role(_business_id, array['owner','admin','manager','cashier']::public.app_role[]) then
    raise exception 'Your role does not allow this action.' using errcode = 'B0002';
  end if;
  perform public.assert_business_can_operate(_business_id);
  if _opening_float is null or _opening_float < 0 then
    raise exception 'Opening float cannot be negative.' using errcode = 'B0001';
  end if;
  if public.cash_open_session_id(_business_id) is not null then
    raise exception 'A cash drawer is already open.' using errcode = 'B0001';
  end if;

  insert into public.cash_sessions (business_id, opened_by, opening_float, note)
  values (_business_id, auth.uid(), round(_opening_float, 2), nullif(trim(coalesce(_note, '')), ''))
  returning id into _id;

  insert into public.cash_movements (
    business_id, session_id, kind, amount, note, created_by
  ) values (
    _business_id, _id, 'open_float', round(_opening_float, 2), 'Opening float', auth.uid()
  );

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary, new_values)
  values (
    _business_id, auth.uid(), 'cash_session.opened', 'cash_session', _id,
    'Opened cash drawer with float ' || round(_opening_float, 2),
    jsonb_build_object('opening_float', round(_opening_float, 2))
  );
  return _id;
end;
$$;

create or replace function public.close_cash_session(
  _business_id uuid,
  _counted_cash numeric,
  _note text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _session public.cash_sessions;
  _expected numeric(14,2);
begin
  if not public.has_business_role(_business_id, array['owner','admin','manager','cashier']::public.app_role[]) then
    raise exception 'Your role does not allow this action.' using errcode = 'B0002';
  end if;
  perform public.assert_business_can_operate(_business_id);
  if _counted_cash is null or _counted_cash < 0 then
    raise exception 'Counted cash cannot be negative.' using errcode = 'B0001';
  end if;

  select * into _session from public.cash_sessions
    where business_id = _business_id and closed_at is null
    for update;
  if not found then
    raise exception 'No cash drawer is open.' using errcode = 'B0001';
  end if;

  select coalesce(sum(amount), 0) into _expected
    from public.cash_movements where session_id = _session.id;

  update public.cash_sessions set
    closed_at = now(),
    closed_by = auth.uid(),
    counted_cash = round(_counted_cash, 2),
    expected_cash = _expected,
    discrepancy = round(_counted_cash, 2) - _expected,
    note = coalesce(nullif(trim(coalesce(_note, '')), ''), note)
  where id = _session.id;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary, new_values)
  values (
    _business_id, auth.uid(), 'cash_session.closed', 'cash_session', _session.id,
    'Closed cash drawer. Counted ' || round(_counted_cash, 2) || ', expected ' || _expected,
    jsonb_build_object(
      'counted', round(_counted_cash, 2),
      'expected', _expected,
      'discrepancy', round(_counted_cash, 2) - _expected
    )
  );

  return jsonb_build_object(
    'sessionId', _session.id,
    'expected', _expected,
    'counted', round(_counted_cash, 2),
    'discrepancy', round(_counted_cash, 2) - _expected
  );
end;
$$;

create or replace function public.add_cash_movement(
  _business_id uuid,
  _kind text,
  _amount numeric,
  _note text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _id uuid;
begin
  if _kind not in ('pay_in', 'pay_out') then
    raise exception 'Only pay in or pay out can be recorded here.' using errcode = 'B0001';
  end if;
  if _kind = 'pay_out' then
    if not public.has_business_role(_business_id, array['owner','admin','manager']::public.app_role[]) then
      raise exception 'Your role does not allow this action.' using errcode = 'B0002';
    end if;
  elsif not public.has_business_role(_business_id, array['owner','admin','manager','cashier']::public.app_role[]) then
    raise exception 'Your role does not allow this action.' using errcode = 'B0002';
  end if;
  perform public.assert_business_can_operate(_business_id);
  if _amount is null or _amount <= 0 then
    raise exception 'Amount must be greater than zero.' using errcode = 'B0001';
  end if;
  if _note is null or length(trim(_note)) < 2 then
    raise exception 'Enter a reason for this cash movement.' using errcode = 'B0001';
  end if;
  _id := public.cash_post_movement(_business_id, _kind, _amount, null, null, _note);
  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary)
  values (
    _business_id, auth.uid(),
    case when _kind = 'pay_in' then 'cash.pay_in' else 'cash.pay_out' end,
    'cash_session', public.cash_open_session_id(_business_id),
    case when _kind = 'pay_in' then 'Cash in ' else 'Cash out ' end || round(_amount, 2)
  );
  return _id;
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
    perform public.assert_business_can_operate(_business_id);
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

comment on table public.platform_runtime is
  'Single-row platform switches. billing_enforced must match Cloud Run BILLING_ENABLED when enforcing paid operate rules in RPCs.';
