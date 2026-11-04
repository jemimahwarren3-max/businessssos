-- Stage 1 (Morning desk): named POS rails, daily takings, customer credit repayments.
-- Does not add EcoCash/InnBucks/ZIPIT provider confirmation. Screenshot ≠ paid.

alter table public.businesses
  add column if not exists timezone text default 'Africa/Harare';

alter table public.payments
  add column if not exists rail text;

alter table public.payments drop constraint if exists payments_rail_check;
alter table public.payments add constraint payments_rail_check
  check (
    rail is null or rail in (
      'cash', 'card', 'ecocash', 'innbucks', 'zipit', 'bank', 'credit',
      'mobile_money', 'bank_transfer'
    )
  );

create index if not exists customers_business_outstanding_idx
  on public.customers (business_id, outstanding_balance desc)
  where outstanding_balance > 0 and deleted_at is null;

-- Named rail → existing payment_method enum. POS still one tender per sale.
create or replace function public.payment_method_for_rail(_rail text)
returns public.payment_method
language plpgsql immutable as $$
begin
  if _rail is null or btrim(_rail) = '' then
    return null;
  end if;
  return case lower(btrim(_rail))
    when 'cash' then 'cash'::public.payment_method
    when 'card' then 'card'::public.payment_method
    when 'ecocash' then 'mobile_money'::public.payment_method
    when 'innbucks' then 'mobile_money'::public.payment_method
    when 'mobile_money' then 'mobile_money'::public.payment_method
    when 'zipit' then 'bank_transfer'::public.payment_method
    when 'bank' then 'bank_transfer'::public.payment_method
    when 'bank_transfer' then 'bank_transfer'::public.payment_method
    when 'credit' then 'credit'::public.payment_method
    else null
  end;
end;
$$;

create or replace function public.default_rail_for_method(_method public.payment_method)
returns text
language sql immutable as $$
  select case _method
    when 'cash' then 'cash'
    when 'card' then 'card'
    when 'mobile_money' then 'mobile_money'
    when 'bank_transfer' then 'bank'
    when 'credit' then 'credit'
  end;
$$;

revoke all on function public.payment_method_for_rail(text) from public, anon;
revoke all on function public.default_rail_for_method(public.payment_method) from public, anon;
grant execute on function public.payment_method_for_rail(text) to authenticated, service_role;
grant execute on function public.default_rail_for_method(public.payment_method) to authenticated, service_role;

drop function if exists public.create_sale(uuid, uuid, numeric, public.payment_method, text, jsonb, text, uuid);

create or replace function public.create_sale(
  _business_id uuid,
  _customer_id uuid,
  _discount numeric,
  _payment_method public.payment_method,
  _notes text,
  _items jsonb,
  _idempotency_key text default null,
  _location_id uuid default null,
  _rail text default null
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
  _method public.payment_method;
  _resolved_rail text;
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

  _resolved_rail := nullif(lower(btrim(coalesce(_rail, ''))), '');
  if _resolved_rail is not null then
    _method := public.payment_method_for_rail(_resolved_rail);
    if _method is null then
      raise exception 'Choose a recognised payment method.' using errcode = 'B0001';
    end if;
  else
    _method := _payment_method;
    _resolved_rail := public.default_rail_for_method(_method);
  end if;

  if _method = 'credit' and _customer_id is null then
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

  if _method = 'cash' then
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
  values (_business_id, _number, _customer_id, _method, 'completed', nullif(trim(_notes), ''), auth.uid(), _idempotency_key, _resolved_location, _cash_session)
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

  if _method = 'credit' then
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
    insert into public.payments (business_id, customer_id, sale_id, amount, method, rail, created_by)
    values (_business_id, _customer_id, _sale_id, _total, _method, _resolved_rail, auth.uid());
  end if;

  if _method = 'cash' then
    perform public.cash_post_movement(_business_id, 'cash_sale', _total, 'sale', _sale_id, _number);
  end if;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary, new_values)
  values (_business_id, auth.uid(), 'sale.created', 'sale', _sale_id,
    'Recorded sale ' || _number, jsonb_build_object('total', _total, 'payment_method', _method, 'rail', _resolved_rail));

  return _sale_id;
end;
$$;

revoke all on function public.create_sale(uuid, uuid, numeric, public.payment_method, text, jsonb, text, uuid, text) from public, anon;
grant execute on function public.create_sale(uuid, uuid, numeric, public.payment_method, text, jsonb, text, uuid, text) to authenticated;

create or replace function public.record_customer_credit_payment(
  _business_id uuid,
  _customer_id uuid,
  _amount numeric,
  _method public.payment_method,
  _rail text default null,
  _reference text default null,
  _idempotency_key text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _payment_id uuid;
  _customer public.customers;
  _resolved_method public.payment_method;
  _resolved_rail text;
  _cash_session uuid;
begin
  if not public.has_permission(_business_id, 'payments.record') then
    raise exception 'You do not have permission to record payments.' using errcode = 'B0002';
  end if;
  perform public.assert_business_can_operate(_business_id);
  if _amount is null or _amount <= 0 then
    raise exception 'Payment amount must be greater than zero.' using errcode = 'B0001';
  end if;
  _amount := round(_amount, 2);

  _resolved_rail := nullif(lower(btrim(coalesce(_rail, ''))), '');
  if _resolved_rail is not null then
    _resolved_method := public.payment_method_for_rail(_resolved_rail);
    if _resolved_method is null then
      raise exception 'Choose a recognised payment method.' using errcode = 'B0001';
    end if;
  else
    _resolved_method := _method;
    _resolved_rail := public.default_rail_for_method(_resolved_method);
  end if;

  if _resolved_method = 'credit' then
    raise exception 'A repayment cannot itself be on credit.' using errcode = 'B0001';
  end if;

  if _idempotency_key is not null then
    select id into _payment_id from public.payments
      where business_id = _business_id and idempotency_key = _idempotency_key limit 1;
    if found then
      return _payment_id;
    end if;
  end if;

  select * into _customer
    from public.customers
    where id = _customer_id and business_id = _business_id and deleted_at is null
    for update;
  if not found then
    raise exception 'That customer could not be found.' using errcode = 'B0001';
  end if;
  if _customer.outstanding_balance <= 0 then
    raise exception 'This customer does not owe anything.' using errcode = 'B0001';
  end if;
  if _amount > _customer.outstanding_balance then
    raise exception 'Payment cannot be more than the outstanding balance.' using errcode = 'B0001';
  end if;

  if _resolved_method = 'cash' then
    _cash_session := public.cash_open_session_id(_business_id);
    if _cash_session is null then
      raise exception 'Open the cash drawer before taking cash.' using errcode = 'B0001';
    end if;
  end if;

  insert into public.payments (
    business_id, customer_id, amount, method, rail, reference, idempotency_key, created_by
  ) values (
    _business_id, _customer_id, _amount, _resolved_method, _resolved_rail,
    nullif(trim(coalesce(_reference, '')), ''), _idempotency_key, auth.uid()
  ) returning id into _payment_id;

  update public.customers
    set outstanding_balance = greatest(outstanding_balance - _amount, 0)
    where id = _customer_id;

  if _resolved_method = 'cash' then
    perform public.cash_post_movement(
      _business_id, 'pay_in', _amount, 'payment', _payment_id, 'Credit repayment'
    );
  end if;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary, new_values)
  values (
    _business_id, auth.uid(), 'payment.recorded', 'customer', _customer_id,
    'Recorded credit repayment of ' || _amount || ' from ' || _customer.name,
    jsonb_build_object('amount', _amount, 'method', _resolved_method, 'rail', _resolved_rail, 'payment_id', _payment_id)
  );

  return _payment_id;
end;
$$;

revoke all on function public.record_customer_credit_payment(uuid, uuid, numeric, public.payment_method, text, text, text) from public, anon;
grant execute on function public.record_customer_credit_payment(uuid, uuid, numeric, public.payment_method, text, text, text) to authenticated;

create or replace function public.get_daily_takings(
  _business_id uuid,
  _day date default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _tz text;
  _local_day date;
  _start timestamptz;
  _end timestamptz;
begin
  if not public.is_business_member(_business_id) then
    raise exception 'You do not have access to this business.' using errcode = 'B0002';
  end if;

  select coalesce(nullif(btrim(b.timezone), ''), 'Africa/Harare')
    into _tz
    from public.businesses b
    where b.id = _business_id;
  if _tz is null then
    raise exception 'That business could not be found.' using errcode = 'B0001';
  end if;

  begin
    _local_day := coalesce(_day, (timezone(_tz, now()))::date);
    _start := (_local_day::timestamp at time zone _tz);
    _end := (((_local_day + 1)::timestamp) at time zone _tz);
  exception when others then
    _tz := 'Africa/Harare';
    _local_day := coalesce(_day, (timezone(_tz, now()))::date);
    _start := (_local_day::timestamp at time zone _tz);
    _end := (((_local_day + 1)::timestamp) at time zone _tz);
  end;

  return jsonb_build_object(
    'day', _local_day,
    'timezone', _tz,
    'received', coalesce((
      select jsonb_agg(jsonb_build_object(
        'rail', t.rail,
        'method', t.method,
        'amount', t.amount
      ) order by t.amount desc)
      from (
        select
          coalesce(nullif(p.rail, ''), public.default_rail_for_method(p.method)) as rail,
          p.method::text as method,
          round(sum(p.amount), 2) as amount
        from public.payments p
        where p.business_id = _business_id
          and p.paid_at >= _start
          and p.paid_at < _end
        group by 1, 2
      ) t
    ), '[]'::jsonb),
    'creditOnAccount', coalesce((
      select round(sum(s.total), 2)
      from public.sales s
      where s.business_id = _business_id
        and s.payment_method = 'credit'
        and s.status in ('completed', 'partially_refunded')
        and s.created_at >= _start
        and s.created_at < _end
    ), 0)
  );
end;
$$;

revoke all on function public.get_daily_takings(uuid, date) from public, anon;
grant execute on function public.get_daily_takings(uuid, date) to authenticated;

comment on column public.payments.rail is
  'Display rail (ecocash, innbucks, zipit, bank, …). Not a provider confirmation.';
comment on function public.record_customer_credit_payment(uuid, uuid, numeric, public.payment_method, text, text, text) is
  'Records a customer credit-book repayment. Does not mark a shop order paid.';
comment on function public.get_daily_takings(uuid, date) is
  'Today’s recorded tenders grouped by rail, in the business timezone. Not a confirmed EcoCash statement.';
