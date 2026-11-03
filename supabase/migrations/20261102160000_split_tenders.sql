-- Stage 2 (How people actually pay): several payments rows per sale, cash
-- till expected = cash tenders only, optional recorded currency + original
-- amount. Does not convert with platform_fx. Shop checkout stays single-method.

alter table public.payments
  add column if not exists currency text;

alter table public.payments
  add column if not exists amount_original numeric(14,2);

alter table public.payments drop constraint if exists payments_currency_check;
alter table public.payments add constraint payments_currency_check
  check (currency is null or currency ~ '^[A-Z]{3}$');

alter table public.payments drop constraint if exists payments_amount_original_check;
alter table public.payments add constraint payments_amount_original_check
  check (amount_original is null or amount_original > 0);

comment on column public.payments.currency is
  'Currency as recorded by the cashier. Not converted via platform_fx.';
comment on column public.payments.amount_original is
  'Amount handed over in payments.currency. amount is the business-currency allocation toward the sale.';

-- Drop every prior create_sale overload. Older staging-manifest files
-- recreate the 8-arg body; leaving it next to the 10-arg function makes
-- `create_sale(uuid, uuid, int, …)` ambiguous.
drop function if exists public.create_sale(uuid, uuid, numeric, public.payment_method, text, jsonb);
drop function if exists public.create_sale(uuid, uuid, numeric, public.payment_method, text, jsonb, text);
drop function if exists public.create_sale(uuid, uuid, numeric, public.payment_method, text, jsonb, text, uuid);
drop function if exists public.create_sale(uuid, uuid, numeric, public.payment_method, text, jsonb, text, uuid, text);
drop function if exists public.create_sale(uuid, uuid, numeric, public.payment_method, text, jsonb, text, uuid, text, jsonb);

create or replace function public.create_sale(
  _business_id uuid,
  _customer_id uuid,
  _discount numeric,
  _payment_method public.payment_method,
  _notes text,
  _items jsonb,
  _idempotency_key text default null,
  _location_id uuid default null,
  _rail text default null,
  _tenders jsonb default null
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
  _biz_currency text;
  _has_tenders boolean;
  _tender jsonb;
  _tender_rail text;
  _tender_method public.payment_method;
  _tender_amount numeric(14,2);
  _tender_currency text;
  _tender_original numeric(14,2);
  _tender_reference text;
  _tender_sum numeric(14,2) := 0;
  _cash_total numeric(14,2) := 0;
  _credit_total numeric(14,2) := 0;
  _primary_amount numeric(14,2) := -1;
  _seen_rails text[] := '{}';
  _tender_count int := 0;
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

  select upper(btrim(coalesce(currency, 'USD'))) into _biz_currency
    from public.businesses where id = _business_id;
  if _biz_currency is null or _biz_currency !~ '^[A-Z]{3}$' then
    _biz_currency := 'USD';
  end if;

  _has_tenders := _tenders is not null
    and jsonb_typeof(_tenders) = 'array'
    and jsonb_array_length(_tenders) > 0;

  if _has_tenders then
    _tender_count := jsonb_array_length(_tenders);
    if _tender_count > 8 then
      raise exception 'A sale can be split across at most 8 payment methods.' using errcode = 'B0001';
    end if;
    for _tender in select value from jsonb_array_elements(_tenders)
    loop
      _tender_rail := nullif(lower(btrim(coalesce(_tender->>'rail', _tender->>'method', ''))), '');
      if _tender_rail is null then
        raise exception 'Each tender needs a payment method.' using errcode = 'B0001';
      end if;
      if _tender_rail = any (_seen_rails) then
        raise exception 'Use each payment method once on a split sale.' using errcode = 'B0001';
      end if;
      _seen_rails := array_append(_seen_rails, _tender_rail);
      _tender_method := public.payment_method_for_rail(_tender_rail);
      if _tender_method is null then
        raise exception 'Choose a recognised payment method.' using errcode = 'B0001';
      end if;
      begin
        _tender_amount := round((_tender->>'amount')::numeric, 2);
      exception when others then
        raise exception 'Each tender needs an amount greater than zero.' using errcode = 'B0001';
      end;
      if _tender_amount is null or _tender_amount <= 0 then
        raise exception 'Each tender needs an amount greater than zero.' using errcode = 'B0001';
      end if;
      _tender_sum := _tender_sum + _tender_amount;
      if _tender_method = 'cash' then
        _cash_total := _cash_total + _tender_amount;
      end if;
      if _tender_method = 'credit' then
        _credit_total := _credit_total + _tender_amount;
      end if;
      if _tender_amount > _primary_amount then
        _primary_amount := _tender_amount;
        _method := _tender_method;
        _resolved_rail := _tender_rail;
      end if;
    end loop;
  else
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
    if _method = 'cash' then
      _cash_total := 1; -- placeholder until sale total is known
    elsif _method = 'credit' then
      _credit_total := 1;
    end if;
  end if;

  if _credit_total > 0 and _customer_id is null then
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

  if _cash_total > 0 then
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

  if not _has_tenders then
    if _method = 'cash' then
      _cash_total := _total;
      _credit_total := 0;
    elsif _method = 'credit' then
      _cash_total := 0;
      _credit_total := _total;
    else
      _cash_total := 0;
      _credit_total := 0;
    end if;
    _tenders := jsonb_build_array(jsonb_build_object(
      'rail', _resolved_rail,
      'amount', _total
    ));
  else
    if _tender_sum <> _total then
      raise exception 'Tender amounts must add up to the sale total.' using errcode = 'B0001';
    end if;
  end if;

  update public.sales
    set subtotal = _subtotal,
        tax = _tax,
        total = _total,
        cost_total = _cost_total,
        discount = _discount,
        amount_paid = _total - _credit_total
    where id = _sale_id;

  if _credit_total > 0 and _customer_id is not null then
    update public.customers
      set outstanding_balance = outstanding_balance + _credit_total
      where id = _customer_id;
  end if;

  -- Amounts are stored as typed. This function must not read platform_fx.
  for _tender in select value from jsonb_array_elements(_tenders)
  loop
    _tender_rail := nullif(lower(btrim(coalesce(_tender->>'rail', _tender->>'method', ''))), '');
    _tender_method := public.payment_method_for_rail(_tender_rail);
    _tender_amount := round((_tender->>'amount')::numeric, 2);
    _tender_currency := upper(btrim(coalesce(_tender->>'currency', _tender->>'currencyOriginal', '')));
    if _tender_currency = '' then
      _tender_currency := _biz_currency;
    end if;
    if _tender_currency !~ '^[A-Z]{3}$' then
      raise exception 'Use a 3-letter currency code.' using errcode = 'B0001';
    end if;
    _tender_original := null;
    if coalesce(_tender->>'amountOriginal', _tender->>'amount_original', '') <> '' then
      begin
        _tender_original := round(coalesce(_tender->>'amountOriginal', _tender->>'amount_original')::numeric, 2);
      exception when others then
        raise exception 'Original amount must be greater than zero.' using errcode = 'B0001';
      end;
    end if;
    if _tender_original is null then
      if _tender_currency <> _biz_currency then
        raise exception 'Enter the original amount for a different currency. Kwetuu does not convert it.' using errcode = 'B0001';
      end if;
      _tender_original := _tender_amount;
    end if;
    if _tender_original <= 0 then
      raise exception 'Original amount must be greater than zero.' using errcode = 'B0001';
    end if;
    _tender_reference := nullif(btrim(coalesce(_tender->>'reference', '')), '');

    if _tender_method = 'credit' then
      continue;
    end if;

    insert into public.payments (
      business_id, customer_id, sale_id, amount, method, rail, currency, amount_original, reference, created_by
    ) values (
      _business_id, _customer_id, _sale_id, _tender_amount, _tender_method, _tender_rail,
      _tender_currency, _tender_original, _tender_reference, auth.uid()
    );
  end loop;

  if _cash_total > 0 then
    perform public.cash_post_movement(_business_id, 'cash_sale', _cash_total, 'sale', _sale_id, _number);
  end if;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary, new_values)
  values (_business_id, auth.uid(), 'sale.created', 'sale', _sale_id,
    'Recorded sale ' || _number, jsonb_build_object(
      'total', _total,
      'payment_method', _method,
      'rail', _resolved_rail,
      'cash', _cash_total,
      'credit', _credit_total
    ));

  return _sale_id;
end;
$$;

revoke all on function public.create_sale(uuid, uuid, numeric, public.payment_method, text, jsonb, text, uuid, text, jsonb) from public, anon;
grant execute on function public.create_sale(uuid, uuid, numeric, public.payment_method, text, jsonb, text, uuid, text, jsonb) to authenticated;

comment on function public.create_sale(uuid, uuid, numeric, public.payment_method, text, jsonb, text, uuid, text, jsonb) is
  'POS sale. Optional _tenders must sum to the sale total. Cash till posts cash tenders only. Does not convert currencies.';

-- Refunds: cash back to the till is cash-first, not the whole refund of a split sale.
create or replace function public.refund_sale(
  _business_id uuid,
  _sale_id uuid,
  _items jsonb,
  _reason text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _sale public.sales;
  _refund_id uuid;
  _item jsonb;
  _sale_item public.sale_items;
  _already_refunded numeric(14,3);
  _remaining numeric(14,3);
  _qty numeric(14,3);
  _line_subtotal numeric(14,2);
  _line_tax numeric(14,2);
  _line_cost numeric(14,2);
  _refund_subtotal numeric(14,2) := 0;
  _refund_tax numeric(14,2) := 0;
  _refund_cost numeric(14,2) := 0;
  _refund_total numeric(14,2);
  _new_total numeric(14,2);
  _fully_refunded boolean;
  _stock_before numeric(14,3);
  _stock_after numeric(14,3);
  _cash_paid numeric(14,2);
  _cash_already_refunded numeric(14,2);
  _remaining_cash numeric(14,2);
  _cash_refund numeric(14,2);
  _current_credit numeric(14,2);
  _remaining_digital numeric(14,2);
  _leftover numeric(14,2);
  _credit_refund numeric(14,2);
  _received_refund numeric(14,2);
  _amount_paid_new numeric(14,2);
begin
  if not public.has_business_role(_business_id, array['owner','admin','manager']::public.app_role[]) then
    raise exception 'Your role does not allow this action.' using errcode = 'B0002';
  end if;
  if _items is null or jsonb_array_length(_items) = 0 then
    raise exception 'Select at least one item to refund.' using errcode = 'B0001';
  end if;

  select * into _sale from public.sales
    where id = _sale_id and business_id = _business_id
    for update;
  if not found then
    raise exception 'That sale could not be found.' using errcode = 'B0001';
  end if;
  if _sale.status not in ('completed', 'partially_refunded') then
    raise exception 'This sale can''t be refunded (status: %).', _sale.status using errcode = 'B0001';
  end if;

  select coalesce(sum(amount), 0) into _cash_paid
    from public.payments
    where sale_id = _sale_id and business_id = _business_id and method = 'cash';
  if _cash_paid = 0 and _sale.payment_method = 'cash' then
    _cash_paid := coalesce(_sale.amount_paid, 0);
  end if;

  select coalesce(sum(abs(cm.amount)), 0) into _cash_already_refunded
    from public.cash_movements cm
    where cm.business_id = _business_id
      and cm.kind = 'cash_refund'
      and cm.reference_id in (select id from public.sale_refunds where sale_id = _sale_id);
  _remaining_cash := greatest(_cash_paid - _cash_already_refunded, 0);

  if _remaining_cash > 0 and public.cash_open_session_id(_business_id) is null then
    raise exception 'Open the cash drawer before refunding cash.' using errcode = 'B0001';
  end if;

  insert into public.sale_refunds (business_id, sale_id, reason, created_by)
  values (_business_id, _sale_id, nullif(trim(_reason), ''), auth.uid())
  returning id into _refund_id;

  for _item in select * from jsonb_array_elements(_items)
  loop
    select * into _sale_item from public.sale_items
      where id = nullif(_item->>'saleItemId', '')::uuid and sale_id = _sale_id
      for update;
    if not found then
      raise exception 'One of the selected items does not belong to this sale.' using errcode = 'B0001';
    end if;

    _qty := (_item->>'quantity')::numeric;
    if _qty is null or _qty <= 0 then
      raise exception 'Refund quantity must be greater than zero.' using errcode = 'B0001';
    end if;

    select coalesce(sum(sri.quantity), 0) into _already_refunded
      from public.sale_refund_items sri
      join public.sale_refunds sr on sr.id = sri.sale_refund_id
      where sri.sale_item_id = _sale_item.id and sr.sale_id = _sale_id;
    _remaining := _sale_item.quantity - _already_refunded;
    if _qty > _remaining then
      raise exception '% of % has already been refunded, % is left to refund.',
        _already_refunded, _sale_item.name, _remaining using errcode = 'B0001';
    end if;

    _line_subtotal := round(_qty * _sale_item.unit_price, 2);
    _line_tax := round(_qty / _sale_item.quantity * _sale_item.tax, 2);
    _line_cost := round(_qty * _sale_item.cost_price, 2);

    insert into public.sale_refund_items (
      business_id, sale_refund_id, sale_item_id, quantity, unit_price, tax, line_total
    ) values (
      _business_id, _refund_id, _sale_item.id, _qty, _sale_item.unit_price, _line_tax,
      _line_subtotal + _line_tax
    );

    if _sale_item.product_id is not null then
      select stock into _stock_before from public.products where id = _sale_item.product_id for update;
      _stock_after := _stock_before + _qty;
      update public.products set stock = _stock_after where id = _sale_item.product_id;
      insert into public.inventory_movements (
        business_id, product_id, movement_type, quantity, stock_before, stock_after,
        reference_type, reference_id, created_by
      ) values (
        _business_id, _sale_item.product_id, 'return', _qty, _stock_before, _stock_after,
        'sale_refund', _refund_id, auth.uid()
      );
    end if;

    _refund_subtotal := _refund_subtotal + _line_subtotal;
    _refund_tax := _refund_tax + _line_tax;
    _refund_cost := _refund_cost + _line_cost;
  end loop;

  _refund_total := _refund_subtotal + _refund_tax;
  update public.sale_refunds
    set subtotal = _refund_subtotal, tax = _refund_tax, total = _refund_total
    where id = _refund_id;

  _new_total := greatest(_sale.total - _refund_total, 0);

  select not exists (
    select 1 from public.sale_items si
    where si.sale_id = _sale_id
      and si.quantity > coalesce((
        select sum(sri.quantity) from public.sale_refund_items sri
        join public.sale_refunds sr on sr.id = sri.sale_refund_id
        where sri.sale_item_id = si.id and sr.sale_id = _sale_id
      ), 0)
  ) into _fully_refunded;

  _cash_refund := least(_refund_total, _remaining_cash);
  _leftover := greatest(_refund_total - _cash_refund, 0);
  _remaining_digital := greatest(coalesce(_sale.amount_paid, 0) - _remaining_cash, 0);
  _current_credit := greatest(_sale.total - coalesce(_sale.amount_paid, 0), 0);
  if _leftover > _remaining_digital then
    _credit_refund := least(_leftover - _remaining_digital, _current_credit);
  else
    _credit_refund := 0;
  end if;
  _received_refund := _refund_total - _credit_refund;
  _amount_paid_new := greatest(coalesce(_sale.amount_paid, 0) - _received_refund, 0);
  _amount_paid_new := least(_amount_paid_new, _new_total);

  update public.sales set
    subtotal = greatest(subtotal - _refund_subtotal, 0),
    tax = greatest(tax - _refund_tax, 0),
    cost_total = greatest(cost_total - _refund_cost, 0),
    total = _new_total,
    amount_paid = _amount_paid_new,
    status = case when _fully_refunded then 'refunded'::public.sale_status else 'partially_refunded'::public.sale_status end
    where id = _sale_id;

  if _credit_refund > 0 and _sale.customer_id is not null then
    update public.customers
      set outstanding_balance = greatest(outstanding_balance - _credit_refund, 0)
      where id = _sale.customer_id;
  end if;

  if _cash_refund > 0 then
    perform public.cash_post_movement(_business_id, 'cash_refund', _cash_refund, 'sale_refund', _refund_id, _sale.sale_number);
  end if;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary, old_values, new_values)
  values (
    _business_id, auth.uid(), 'sale.refunded', 'sale', _sale_id,
    _sale.sale_number || ': refunded ' || _refund_total,
    jsonb_build_object('total', _sale.total, 'status', _sale.status),
    jsonb_build_object(
      'total', _new_total,
      'status', case when _fully_refunded then 'refunded' else 'partially_refunded' end,
      'cash_refund', _cash_refund,
      'credit_refund', _credit_refund
    )
  );

  return _refund_id;
end;
$$;

revoke all on function public.refund_sale(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.refund_sale(uuid, uuid, jsonb, text) to authenticated;

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
          and p.method <> 'credit'
        group by 1, 2
      ) t
    ), '[]'::jsonb),
    'creditOnAccount', coalesce((
      select round(sum(greatest(s.total - coalesce(s.amount_paid, 0), 0)), 2)
      from public.sales s
      where s.business_id = _business_id
        and s.status in ('completed', 'partially_refunded')
        and s.created_at >= _start
        and s.created_at < _end
        and coalesce(s.amount_paid, 0) < s.total
    ), 0)
  );
end;
$$;

revoke all on function public.get_daily_takings(uuid, date) from public, anon;
grant execute on function public.get_daily_takings(uuid, date) to authenticated;
