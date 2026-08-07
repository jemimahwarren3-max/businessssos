-- Sales and invoices previously had no protection against a double-submit
-- (double-click, or a network retry re-sending the same request) creating
-- two records for one real transaction — only payments had this. Adds the
-- same idempotency_key pattern already used on public.payments.

alter table public.sales add column if not exists idempotency_key text;
create unique index if not exists sales_idempotency_uniq
  on public.sales(business_id, idempotency_key) where idempotency_key is not null;

alter table public.invoices add column if not exists idempotency_key text;
create unique index if not exists invoices_idempotency_uniq
  on public.invoices(business_id, idempotency_key) where idempotency_key is not null;

-- ============ create_sale: add idempotency ============
drop function if exists public.create_sale(uuid,uuid,numeric,public.payment_method,text,jsonb);

create or replace function public.create_sale(
  _business_id uuid,
  _customer_id uuid,
  _discount numeric,
  _payment_method public.payment_method,
  _notes text,
  _items jsonb,
  _idempotency_key text default null
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

  if _idempotency_key is not null then
    select id into _sale_id from public.sales
      where business_id = _business_id and idempotency_key = _idempotency_key limit 1;
    if found then
      return _sale_id;
    end if;
  end if;

  select allow_negative_stock into _allow_negative from public.business_settings where business_id = _business_id;

  insert into public.business_counters (business_id) values (_business_id)
    on conflict (business_id) do nothing;
  update public.business_counters set sale_seq = sale_seq + 1
    where business_id = _business_id returning sale_seq into _seq;
  _number := 'S-' || lpad(_seq::text, 4, '0');

  insert into public.sales (business_id, sale_number, customer_id, payment_method, status, notes, created_by, idempotency_key)
  values (_business_id, _number, _customer_id, _payment_method, 'completed', nullif(trim(_notes), ''), auth.uid(), _idempotency_key)
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
revoke all on function public.create_sale(uuid,uuid,numeric,public.payment_method,text,jsonb,text) from public;
grant execute on function public.create_sale(uuid,uuid,numeric,public.payment_method,text,jsonb,text) to authenticated;

-- ============ create_invoice: add idempotency ============
drop function if exists public.create_invoice(uuid,uuid,date,date,text,text,numeric,jsonb);

create or replace function public.create_invoice(
  _business_id uuid,
  _customer_id uuid,
  _issue_date date,
  _due_date date,
  _notes text,
  _terms text,
  _discount numeric,
  _items jsonb,
  _idempotency_key text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _invoice_id uuid;
  _seq int;
  _prefix text;
  _number text;
  _subtotal numeric(14,2) := 0;
  _tax numeric(14,2) := 0;
  _total numeric(14,2);
  _item jsonb;
  _line_subtotal numeric(14,2);
  _line_tax numeric(14,2);
  _qty numeric(14,3);
  _price numeric(14,2);
begin
  if not public.has_business_role(_business_id, array['owner','admin','manager','accountant']::public.app_role[]) then
    raise exception 'You do not have permission to create invoices.' using errcode = 'B0002';
  end if;
  if _items is null or jsonb_array_length(_items) = 0 then
    raise exception 'An invoice needs at least one item.' using errcode = 'B0001';
  end if;
  if _discount is null or _discount < 0 then
    raise exception 'Discount cannot be negative.' using errcode = 'B0001';
  end if;
  if _customer_id is not null and not exists (
    select 1 from public.customers where id = _customer_id and business_id = _business_id and deleted_at is null
  ) then
    raise exception 'That customer could not be found.' using errcode = 'B0001';
  end if;

  if _idempotency_key is not null then
    select id into _invoice_id from public.invoices
      where business_id = _business_id and idempotency_key = _idempotency_key limit 1;
    if found then
      return _invoice_id;
    end if;
  end if;

  insert into public.business_counters (business_id) values (_business_id)
    on conflict (business_id) do nothing;
  update public.business_counters set invoice_seq = invoice_seq + 1
    where business_id = _business_id returning invoice_seq into _seq;
  select invoice_prefix into _prefix from public.businesses where id = _business_id;
  _number := coalesce(_prefix, 'INV') || '-' || lpad(_seq::text, 4, '0');

  insert into public.invoices (
    business_id, invoice_number, customer_id, issue_date, due_date, notes, terms, discount, status, created_by, idempotency_key
  ) values (
    _business_id, _number, _customer_id, coalesce(_issue_date, current_date), _due_date,
    nullif(trim(_notes), ''), nullif(trim(_terms), ''), _discount, 'draft', auth.uid(), _idempotency_key
  ) returning id into _invoice_id;

  for _item in select * from jsonb_array_elements(_items)
  loop
    _qty := (_item->>'quantity')::numeric;
    _price := (_item->>'unitPrice')::numeric;
    if _qty is null or _qty <= 0 then
      raise exception 'Item quantity must be greater than zero.' using errcode = 'B0001';
    end if;
    if _price is null or _price < 0 then
      raise exception 'Item price cannot be negative.' using errcode = 'B0001';
    end if;
    _line_subtotal := round(_qty * _price, 2);
    _line_tax := round(_line_subtotal * coalesce((_item->>'taxRate')::numeric, 0) / 100, 2);
    insert into public.invoice_items (
      business_id, invoice_id, product_id, name, quantity, unit_price, discount, tax, line_total
    ) values (
      _business_id, _invoice_id, nullif(_item->>'productId', '')::uuid,
      _item->>'name', _qty, _price, 0, _line_tax, _line_subtotal + _line_tax
    );
    _subtotal := _subtotal + _line_subtotal;
    _tax := _tax + _line_tax;
  end loop;

  _total := greatest(_subtotal - _discount + _tax, 0);
  update public.invoices set subtotal = _subtotal, tax = _tax, total = _total where id = _invoice_id;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary, new_values)
  values (_business_id, auth.uid(), 'invoice.created', 'invoice', _invoice_id,
    'Created invoice ' || _number, jsonb_build_object('total', _total, 'status', 'draft'));

  return _invoice_id;
end;
$$;
revoke all on function public.create_invoice(uuid,uuid,date,date,text,text,numeric,jsonb,text) from public;
grant execute on function public.create_invoice(uuid,uuid,date,date,text,text,numeric,jsonb,text) to authenticated;
