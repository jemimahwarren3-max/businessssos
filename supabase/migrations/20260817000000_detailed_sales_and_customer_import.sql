-- Bulk import of real line-item historical sales — one row = one product =
-- one sale, mirroring create_sale's per-item logic but kept as a separate
-- function (same reason import_sale_history_row is separate: a bulk import
-- must never be able to change behavior for the live POS path) and taking
-- an explicit historical date so imported rows land on real dates instead
-- of all clustering on "now".
create or replace function public.import_sale_line(
  _business_id uuid,
  _sale_date timestamptz,
  _product_id uuid,
  _quantity numeric,
  _unit_price numeric,
  _customer_id uuid,
  _payment_method public.payment_method,
  _notes text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _seq int;
  _number text;
  _sale_id uuid;
  _product public.products;
  _price numeric(14,2);
  _line_subtotal numeric(14,2);
  _line_tax numeric(14,2);
  _line_total numeric(14,2);
  _stock_before numeric(14,3);
  _stock_after numeric(14,3);
  _allow_negative boolean;
begin
  if not public.has_business_role(_business_id, array['owner','admin','manager','accountant']::public.app_role[]) then
    raise exception 'You do not have permission to import sales.' using errcode = 'B0002';
  end if;
  if _sale_date is null then
    raise exception 'Sale date is required.' using errcode = 'B0001';
  end if;
  if _quantity is null or _quantity <= 0 then
    raise exception 'Quantity must be greater than zero.' using errcode = 'B0001';
  end if;
  if _payment_method = 'credit' and _customer_id is null then
    raise exception 'Select a customer for credit sales.' using errcode = 'B0001';
  end if;
  if _customer_id is not null and not exists (
    select 1 from public.customers where id = _customer_id and business_id = _business_id and deleted_at is null
  ) then
    raise exception 'That customer could not be found.' using errcode = 'B0001';
  end if;

  select * into _product from public.products
    where id = _product_id and business_id = _business_id and deleted_at is null
    for update;
  if not found then
    raise exception 'That product could not be found.' using errcode = 'B0001';
  end if;

  _price := coalesce(_unit_price, _product.selling_price);
  if _price < 0 then
    raise exception 'Item price cannot be negative.' using errcode = 'B0001';
  end if;

  select allow_negative_stock into _allow_negative from public.business_settings where business_id = _business_id;

  _stock_before := _product.stock;
  _stock_after := _stock_before - _quantity;
  if _stock_after < 0 and not coalesce(_allow_negative, false) then
    raise exception 'Not enough stock for %. Only % left.', _product.name, _stock_before using errcode = 'B0001';
  end if;

  insert into public.business_counters (business_id) values (_business_id)
    on conflict (business_id) do nothing;
  update public.business_counters set sale_seq = sale_seq + 1
    where business_id = _business_id returning sale_seq into _seq;
  _number := 'IMP-' || lpad(_seq::text, 4, '0');

  _line_subtotal := round(_quantity * _price, 2);
  _line_tax := round(_line_subtotal * coalesce(_product.tax_rate, 0) / 100, 2);
  _line_total := _line_subtotal + _line_tax;

  insert into public.sales (
    business_id, sale_number, customer_id, subtotal, tax, discount, total, cost_total,
    amount_paid, payment_method, status, notes, created_by, created_at
  ) values (
    _business_id, _number, _customer_id, _line_subtotal, _line_tax, 0, _line_total,
    round(_quantity * _product.cost_price, 2),
    case when _payment_method = 'credit' then 0 else _line_total end,
    _payment_method, 'completed', coalesce(nullif(trim(_notes), ''), 'Imported from spreadsheet'),
    auth.uid(), _sale_date
  ) returning id into _sale_id;

  insert into public.sale_items (
    business_id, sale_id, product_id, name, sku, quantity, unit_price, cost_price, discount, tax, line_total, created_at
  ) values (
    _business_id, _sale_id, _product.id, _product.name, _product.sku, _quantity, _price,
    _product.cost_price, 0, _line_tax, _line_total, _sale_date
  );

  update public.products set stock = _stock_after where id = _product.id;
  insert into public.inventory_movements (
    business_id, product_id, movement_type, quantity, stock_before, stock_after, reference_type, reference_id, created_by, created_at
  ) values (
    _business_id, _product.id, 'sale', -_quantity, _stock_before, _stock_after, 'sale', _sale_id, auth.uid(), _sale_date
  );

  if _payment_method = 'credit' then
    if _customer_id is not null then
      update public.customers set outstanding_balance = outstanding_balance + _line_total where id = _customer_id;
    end if;
  else
    insert into public.payments (business_id, customer_id, sale_id, amount, method, created_by, paid_at, created_at)
    values (_business_id, _customer_id, _sale_id, _line_total, _payment_method, auth.uid(), _sale_date, _sale_date);
  end if;

  return _sale_id;
end;
$$;
revoke all on function public.import_sale_line(uuid,timestamptz,uuid,numeric,numeric,uuid,public.payment_method,text) from public;
grant execute on function public.import_sale_line(uuid,timestamptz,uuid,numeric,numeric,uuid,public.payment_method,text) to authenticated;

alter table public.audit_logs drop constraint if exists audit_logs_action_check;
alter table public.audit_logs
  add constraint audit_logs_action_check check (
    action in (
      'business.created', 'product.created', 'products.imported',
      'inventory.adjusted', 'customer.created', 'quote.status_changed',
      'expense.created', 'expense.deleted', 'expenses.imported', 'sales.imported',
      'sale.created', 'invoice.created', 'invoice.status_changed',
      'payment.recorded', 'quote.created', 'quote.converted', 'data.exported',
      'supplier.created', 'supplier.updated', 'supplier.deleted',
      'purchase_order.created', 'sales.imported_detailed', 'customers.imported'
    )
  );
