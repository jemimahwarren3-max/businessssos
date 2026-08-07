alter table public.business_counters add column if not exists sale_seq integer not null default 0;

create or replace function public.create_sale(
  _business_id uuid,
  _customer_id uuid,
  _discount numeric,
  _payment_method public.payment_method,
  _notes text,
  _items jsonb
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
begin
  if not public.has_business_role(_business_id, array['owner','admin','manager','cashier']::public.app_role[]) then
    raise exception 'You do not have permission to record sales.' using errcode = 'B0002';
  end if;
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

  select allow_negative_stock into _allow_negative from public.business_settings where business_id = _business_id;

  insert into public.business_counters (business_id) values (_business_id)
    on conflict (business_id) do nothing;
  update public.business_counters set sale_seq = sale_seq + 1
    where business_id = _business_id returning sale_seq into _seq;
  _number := 'S-' || lpad(_seq::text, 4, '0');

  insert into public.sales (business_id, sale_number, customer_id, payment_method, status, notes, created_by)
  values (_business_id, _number, _customer_id, _payment_method, 'completed', nullif(trim(_notes), ''), auth.uid())
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

    _price := coalesce((_item->>'unitPrice')::numeric, _product.selling_price);
    if _price < 0 then
      raise exception 'Item price cannot be negative.' using errcode = 'B0001';
    end if;

    _stock_before := _product.stock;
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

    update public.products set stock = _stock_after where id = _product.id;
    insert into public.inventory_movements (
      business_id, product_id, movement_type, quantity, stock_before, stock_after, reference_type, reference_id, created_by
    ) values (
      _business_id, _product.id, 'sale', -_qty, _stock_before, _stock_after, 'sale', _sale_id, auth.uid()
    );

    _subtotal := _subtotal + _line_subtotal;
    _tax := _tax + _line_tax;
    _cost_total := _cost_total + round(_qty * _product.cost_price, 2);
  end loop;

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

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary, new_values)
  values (_business_id, auth.uid(), 'sale.created', 'sale', _sale_id,
    'Recorded sale ' || _number, jsonb_build_object('total', _total, 'payment_method', _payment_method));

  return _sale_id;
end;
$$;
revoke all on function public.create_sale(uuid,uuid,numeric,public.payment_method,text,jsonb) from public;
grant execute on function public.create_sale(uuid,uuid,numeric,public.payment_method,text,jsonb) to authenticated;
