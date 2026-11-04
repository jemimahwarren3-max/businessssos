-- Stage 3 (Notebook and delivery): supplier outstanding on PO receive,
-- supplier payments, customer deposits, lay-by (not invoices), wholesale
-- price column, marketplace verified-on-Kwetuu badge.
-- Zone presets are client data. This file does not convert shop money.

alter table public.payments
  add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;

create index if not exists payments_supplier_idx
  on public.payments (business_id, supplier_id)
  where supplier_id is not null;

alter table public.products
  add column if not exists wholesale_price numeric(14,2);

alter table public.products drop constraint if exists products_wholesale_price_check;
alter table public.products add constraint products_wholesale_price_check
  check (wholesale_price is null or wholesale_price >= 0);

comment on column public.products.wholesale_price is
  'Optional second recorded price. POS and the shop still sell at selling_price.';
comment on column public.payments.supplier_id is
  'When set, this payment is a supplier pay-out and is excluded from daily takings.';

create table if not exists public.customer_deposits (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  status text not null default 'held' check (status in ('held', 'applied', 'refunded')),
  method public.payment_method not null,
  rail text,
  reference text,
  payment_id uuid references public.payments(id) on delete set null,
  applied_to text check (applied_to is null or applied_to in ('credit', 'layby')),
  layby_id uuid,
  idempotency_key text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists customer_deposits_idempotency_uniq
  on public.customer_deposits (business_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists customer_deposits_customer_idx
  on public.customer_deposits (business_id, customer_id, created_at desc);

create table if not exists public.laybys (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  layby_number text not null,
  status text not null default 'open' check (status in ('open', 'ready', 'collected', 'cancelled')),
  subtotal numeric(14,2) not null default 0,
  tax numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0 check (total >= 0),
  amount_paid numeric(14,2) not null default 0 check (amount_paid >= 0),
  collect_after numeric(14,2) not null default 0 check (collect_after >= 0),
  notes text,
  sale_id uuid references public.sales(id) on delete set null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, layby_number)
);
create index if not exists laybys_business_status_idx
  on public.laybys (business_id, status, created_at desc);

create table if not exists public.layby_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  layby_id uuid not null references public.laybys(id) on delete cascade,
  product_id uuid not null references public.products(id),
  name text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  tax numeric(14,2) not null default 0,
  line_total numeric(14,2) not null,
  created_at timestamptz not null default now()
);
create index if not exists layby_items_layby_idx on public.layby_items (layby_id);

create table if not exists public.layby_instalments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  layby_id uuid not null references public.laybys(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  method public.payment_method not null,
  rail text,
  reference text,
  payment_id uuid references public.payments(id) on delete set null,
  deposit_id uuid references public.customer_deposits(id) on delete set null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists layby_instalments_layby_idx
  on public.layby_instalments (layby_id, created_at);

alter table public.customer_deposits
  drop constraint if exists customer_deposits_layby_id_fkey;
alter table public.customer_deposits
  add constraint customer_deposits_layby_id_fkey
  foreign key (layby_id) references public.laybys(id) on delete set null;

alter table public.customer_deposits enable row level security;
alter table public.laybys enable row level security;
alter table public.layby_items enable row level security;
alter table public.layby_instalments enable row level security;

grant select on public.customer_deposits, public.laybys, public.layby_items, public.layby_instalments
  to authenticated;
grant all on public.customer_deposits, public.laybys, public.layby_items, public.layby_instalments
  to service_role;

drop policy if exists customer_deposits_member_read on public.customer_deposits;
create policy customer_deposits_member_read on public.customer_deposits
  for select to authenticated using (public.is_business_member(business_id));
drop policy if exists laybys_member_read on public.laybys;
create policy laybys_member_read on public.laybys
  for select to authenticated using (public.is_business_member(business_id));
drop policy if exists layby_items_member_read on public.layby_items;
create policy layby_items_member_read on public.layby_items
  for select to authenticated using (public.is_business_member(business_id));
drop policy if exists layby_instalments_member_read on public.layby_instalments;
create policy layby_instalments_member_read on public.layby_instalments
  for select to authenticated using (public.is_business_member(business_id));

create or replace function public.notebook_resolve_rail(
  _method public.payment_method,
  _rail text
) returns table (resolved_method public.payment_method, resolved_rail text)
language plpgsql
stable
as $$
declare
  _resolved_method public.payment_method;
  _resolved_rail text;
begin
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
  return query select _resolved_method, _resolved_rail;
end;
$$;
revoke all on function public.notebook_resolve_rail(public.payment_method, text) from public, anon;

create or replace function public.set_purchase_order_status(
  _business_id uuid,
  _po_id uuid,
  _status public.purchase_order_status
) returns void
language plpgsql security definer set search_path = public as $$
declare
  _po public.purchase_orders;
  _item record;
  _before numeric(14,3);
  _after numeric(14,3);
begin
  if not public.has_business_role(_business_id, array['owner','admin','manager']::public.app_role[]) then
    raise exception 'Your role does not allow this action.' using errcode = 'B0002';
  end if;
  if _status not in ('received', 'cancelled') then
    raise exception 'Invalid status.' using errcode = 'B0001';
  end if;

  select * into _po from public.purchase_orders
    where id = _po_id and business_id = _business_id
    for update;
  if not found then
    raise exception 'That purchase order could not be found.' using errcode = 'B0001';
  end if;
  if _po.status <> 'sent' then
    raise exception 'This purchase order has already been % and can''t be changed.', _po.status
      using errcode = 'B0001';
  end if;

  if _status = 'received' then
    for _item in
      select poi.product_id, poi.quantity, p.name, p.stock
      from public.purchase_order_items poi
      join public.products p on p.id = poi.product_id
      where poi.purchase_order_id = _po_id and poi.product_id is not null
      for update of p
    loop
      _before := _item.stock;
      _after := _before + _item.quantity;
      update public.products set stock = _after where id = _item.product_id;
      insert into public.inventory_movements (
        business_id, product_id, movement_type, quantity, stock_before, stock_after, reason, created_by
      ) values (
        _business_id, _item.product_id, 'stock_in', _item.quantity, _before, _after,
        'Received ' || _po.po_number, auth.uid()
      );
    end loop;

    if _po.supplier_id is not null and coalesce(_po.total, 0) > 0 then
      update public.suppliers
        set outstanding_amount = outstanding_amount + _po.total
        where id = _po.supplier_id and business_id = _business_id;
    end if;
  end if;

  update public.purchase_orders set status = _status where id = _po_id;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary, old_values, new_values)
  values (
    _business_id, auth.uid(), 'purchase_order.status_changed', 'purchase_order', _po_id,
    _po.po_number || ': ' || _po.status || ' -> ' || _status,
    jsonb_build_object('status', _po.status, 'outstanding_added',
      case when _status = 'received' then coalesce(_po.total, 0) else 0 end),
    jsonb_build_object('status', _status)
  );
end;
$$;
revoke all on function public.set_purchase_order_status(uuid, uuid, public.purchase_order_status) from public, anon;
grant execute on function public.set_purchase_order_status(uuid, uuid, public.purchase_order_status) to authenticated;

create or replace function public.record_supplier_payment(
  _business_id uuid,
  _supplier_id uuid,
  _amount numeric,
  _method public.payment_method,
  _rail text default null,
  _reference text default null,
  _idempotency_key text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _payment_id uuid;
  _supplier public.suppliers;
  _resolved_method public.payment_method;
  _resolved_rail text;
begin
  if not public.has_permission(_business_id, 'payments.record') then
    raise exception 'You do not have permission to record payments.' using errcode = 'B0002';
  end if;
  perform public.assert_business_can_operate(_business_id);
  if _amount is null or _amount <= 0 then
    raise exception 'Payment amount must be greater than zero.' using errcode = 'B0001';
  end if;
  _amount := round(_amount, 2);

  select r.resolved_method, r.resolved_rail into _resolved_method, _resolved_rail
    from public.notebook_resolve_rail(_method, _rail) r;

  if _resolved_method = 'credit' then
    raise exception 'A supplier payment cannot itself be on credit.' using errcode = 'B0001';
  end if;

  if _idempotency_key is not null then
    select id into _payment_id from public.payments
      where business_id = _business_id and idempotency_key = _idempotency_key limit 1;
    if found then
      return _payment_id;
    end if;
  end if;

  select * into _supplier
    from public.suppliers
    where id = _supplier_id and business_id = _business_id and deleted_at is null
    for update;
  if not found then
    raise exception 'That supplier could not be found.' using errcode = 'B0001';
  end if;
  if _supplier.outstanding_amount <= 0 then
    raise exception 'This supplier is not owed anything.' using errcode = 'B0001';
  end if;
  if _amount > _supplier.outstanding_amount then
    raise exception 'Payment cannot be more than the outstanding balance.' using errcode = 'B0001';
  end if;

  if _resolved_method = 'cash' then
    if public.cash_open_session_id(_business_id) is null then
      raise exception 'Open the cash drawer before taking cash.' using errcode = 'B0001';
    end if;
  end if;

  insert into public.payments (
    business_id, supplier_id, amount, method, rail, reference, idempotency_key, created_by
  ) values (
    _business_id, _supplier_id, _amount, _resolved_method, _resolved_rail,
    nullif(trim(coalesce(_reference, '')), ''), _idempotency_key, auth.uid()
  ) returning id into _payment_id;

  update public.suppliers
    set outstanding_amount = greatest(outstanding_amount - _amount, 0)
    where id = _supplier_id;

  if _resolved_method = 'cash' then
    perform public.cash_post_movement(
      _business_id, 'pay_out', _amount, 'payment', _payment_id, 'Supplier payment'
    );
  end if;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary, new_values)
  values (
    _business_id, auth.uid(), 'payment.recorded', 'supplier', _supplier_id,
    'Recorded supplier payment of ' || _amount || ' to ' || _supplier.name,
    jsonb_build_object('amount', _amount, 'method', _resolved_method, 'rail', _resolved_rail, 'payment_id', _payment_id)
  );

  return _payment_id;
end;
$$;
revoke all on function public.record_supplier_payment(uuid, uuid, numeric, public.payment_method, text, text, text) from public, anon;
grant execute on function public.record_supplier_payment(uuid, uuid, numeric, public.payment_method, text, text, text) to authenticated;

create or replace function public.take_customer_deposit(
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
  _deposit_id uuid;
  _payment_id uuid;
  _customer public.customers;
  _resolved_method public.payment_method;
  _resolved_rail text;
begin
  if not public.has_permission(_business_id, 'payments.record') then
    raise exception 'You do not have permission to record payments.' using errcode = 'B0002';
  end if;
  perform public.assert_business_can_operate(_business_id);
  if _amount is null or _amount <= 0 then
    raise exception 'Payment amount must be greater than zero.' using errcode = 'B0001';
  end if;
  _amount := round(_amount, 2);

  select r.resolved_method, r.resolved_rail into _resolved_method, _resolved_rail
    from public.notebook_resolve_rail(_method, _rail) r;

  if _resolved_method = 'credit' then
    raise exception 'A deposit cannot itself be on credit.' using errcode = 'B0001';
  end if;

  if _idempotency_key is not null then
    select id into _deposit_id from public.customer_deposits
      where business_id = _business_id and idempotency_key = _idempotency_key limit 1;
    if found then
      return _deposit_id;
    end if;
  end if;

  select * into _customer
    from public.customers
    where id = _customer_id and business_id = _business_id and deleted_at is null
    for update;
  if not found then
    raise exception 'That customer could not be found.' using errcode = 'B0001';
  end if;

  if _resolved_method = 'cash' then
    if public.cash_open_session_id(_business_id) is null then
      raise exception 'Open the cash drawer before taking cash.' using errcode = 'B0001';
    end if;
  end if;

  insert into public.payments (
    business_id, customer_id, amount, method, rail, reference, idempotency_key, created_by
  ) values (
    _business_id, _customer_id, _amount, _resolved_method, _resolved_rail,
    nullif(trim(coalesce(_reference, '')), ''), _idempotency_key, auth.uid()
  ) returning id into _payment_id;

  insert into public.customer_deposits (
    business_id, customer_id, amount, status, method, rail, reference, payment_id,
    idempotency_key, created_by
  ) values (
    _business_id, _customer_id, _amount, 'held', _resolved_method, _resolved_rail,
    nullif(trim(coalesce(_reference, '')), ''), _payment_id, _idempotency_key, auth.uid()
  ) returning id into _deposit_id;

  if _resolved_method = 'cash' then
    perform public.cash_post_movement(
      _business_id, 'pay_in', _amount, 'payment', _payment_id, 'Customer deposit'
    );
  end if;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary, new_values)
  values (
    _business_id, auth.uid(), 'payment.recorded', 'customer', _customer_id,
    'Took deposit of ' || _amount || ' from ' || _customer.name,
    jsonb_build_object('amount', _amount, 'deposit_id', _deposit_id, 'payment_id', _payment_id)
  );

  return _deposit_id;
end;
$$;
revoke all on function public.take_customer_deposit(uuid, uuid, numeric, public.payment_method, text, text, text) from public, anon;
grant execute on function public.take_customer_deposit(uuid, uuid, numeric, public.payment_method, text, text, text) to authenticated;

create or replace function public.refund_customer_deposit(
  _business_id uuid,
  _deposit_id uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _deposit public.customer_deposits;
begin
  if not public.has_permission(_business_id, 'payments.record') then
    raise exception 'You do not have permission to record payments.' using errcode = 'B0002';
  end if;
  perform public.assert_business_can_operate(_business_id);

  select * into _deposit
    from public.customer_deposits
    where id = _deposit_id and business_id = _business_id
    for update;
  if not found then
    raise exception 'That deposit could not be found.' using errcode = 'B0001';
  end if;
  if _deposit.status <> 'held' then
    raise exception 'Only a held deposit can be refunded.' using errcode = 'B0001';
  end if;

  if _deposit.method = 'cash' and public.cash_open_session_id(_business_id) is null then
    raise exception 'Open the cash drawer before taking cash.' using errcode = 'B0001';
  end if;

  -- Cash deposits leave through the till. Non-cash refunds are recorded here
  -- without claiming EcoCash/bank actually reversed.
  if _deposit.method = 'cash' then
    perform public.cash_post_movement(
      _business_id, 'pay_out', _deposit.amount, 'payment', _deposit.payment_id, 'Deposit refund'
    );
  end if;

  update public.customer_deposits set status = 'refunded', updated_at = now()
    where id = _deposit_id;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary, new_values)
  values (
    _business_id, auth.uid(), 'payment.recorded', 'customer', _deposit.customer_id,
    'Refunded deposit of ' || _deposit.amount,
    jsonb_build_object('deposit_id', _deposit_id, 'amount', _deposit.amount)
  );

  return _deposit_id;
end;
$$;
revoke all on function public.refund_customer_deposit(uuid, uuid) from public, anon;
grant execute on function public.refund_customer_deposit(uuid, uuid) to authenticated;

create or replace function public.create_layby(
  _business_id uuid,
  _customer_id uuid,
  _items jsonb,
  _collect_after numeric default null,
  _notes text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _layby_id uuid;
  _item jsonb;
  _product public.products;
  _qty numeric(14,3);
  _price numeric(14,2);
  _line_subtotal numeric(14,2);
  _line_tax numeric(14,2);
  _subtotal numeric(14,2) := 0;
  _tax numeric(14,2) := 0;
  _total numeric(14,2);
  _collect numeric(14,2);
  _number text;
  _count int;
begin
  if not public.has_permission(_business_id, 'sales.create') then
    raise exception 'You do not have permission to record sales.' using errcode = 'B0002';
  end if;
  perform public.assert_business_can_operate(_business_id);
  if _items is null or jsonb_array_length(_items) = 0 then
    raise exception 'A sale needs at least one item.' using errcode = 'B0001';
  end if;
  if jsonb_array_length(_items) > 20 then
    raise exception 'A lay-by can have at most 20 items.' using errcode = 'B0001';
  end if;
  if not exists (
    select 1 from public.customers
    where id = _customer_id and business_id = _business_id and deleted_at is null
  ) then
    raise exception 'That customer could not be found.' using errcode = 'B0001';
  end if;

  select count(*) + 1 into _count from public.laybys where business_id = _business_id;
  _number := 'LB-' || lpad(_count::text, 4, '0') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4);

  insert into public.laybys (
    business_id, customer_id, layby_number, status, notes, created_by
  ) values (
    _business_id, _customer_id, _number, 'open', nullif(trim(coalesce(_notes, '')), ''), auth.uid()
  ) returning id into _layby_id;

  for _item in select * from jsonb_array_elements(_items)
  loop
    _qty := (_item->>'quantity')::numeric;
    if _qty is null or _qty <= 0 then
      raise exception 'Item quantity must be greater than zero.' using errcode = 'B0001';
    end if;
    select * into _product from public.products
      where id = nullif(_item->>'productId', '')::uuid and business_id = _business_id and deleted_at is null;
    if not found then
      raise exception 'One of the items in this sale could not be found.' using errcode = 'B0001';
    end if;
    _price := _product.selling_price;
    if _price < 0 then
      raise exception 'Item price cannot be negative.' using errcode = 'B0001';
    end if;
    _line_subtotal := round(_qty * _price, 2);
    _line_tax := round(_line_subtotal * coalesce(_product.tax_rate, 0) / 100, 2);
    insert into public.layby_items (
      business_id, layby_id, product_id, name, quantity, unit_price, tax, line_total
    ) values (
      _business_id, _layby_id, _product.id, _product.name, _qty, _price, _line_tax, _line_subtotal + _line_tax
    );
    _subtotal := _subtotal + _line_subtotal;
    _tax := _tax + _line_tax;
  end loop;

  _total := greatest(_subtotal + _tax, 0);
  if _total <= 0 then
    raise exception 'A lay-by needs a total greater than zero.' using errcode = 'B0001';
  end if;
  _collect := coalesce(_collect_after, _total);
  _collect := round(_collect, 2);
  if _collect < 0 or _collect > _total then
    raise exception 'Collect-after cannot be more than the lay-by total.' using errcode = 'B0001';
  end if;

  update public.laybys
    set subtotal = _subtotal, tax = _tax, total = _total, collect_after = _collect
    where id = _layby_id;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary, new_values)
  values (
    _business_id, auth.uid(), 'sale.created', 'layby', _layby_id,
    'Opened lay-by ' || _number,
    jsonb_build_object('total', _total, 'collect_after', _collect)
  );

  return _layby_id;
end;
$$;
revoke all on function public.create_layby(uuid, uuid, jsonb, numeric, text) from public, anon;
grant execute on function public.create_layby(uuid, uuid, jsonb, numeric, text) to authenticated;

create or replace function public.record_layby_instalment(
  _business_id uuid,
  _layby_id uuid,
  _amount numeric,
  _method public.payment_method,
  _rail text default null,
  _reference text default null,
  _idempotency_key text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _layby public.laybys;
  _payment_id uuid;
  _instalment_id uuid;
  _resolved_method public.payment_method;
  _resolved_rail text;
  _remaining numeric(14,2);
begin
  if not public.has_permission(_business_id, 'payments.record') then
    raise exception 'You do not have permission to record payments.' using errcode = 'B0002';
  end if;
  perform public.assert_business_can_operate(_business_id);
  if _amount is null or _amount <= 0 then
    raise exception 'Payment amount must be greater than zero.' using errcode = 'B0001';
  end if;
  _amount := round(_amount, 2);

  select r.resolved_method, r.resolved_rail into _resolved_method, _resolved_rail
    from public.notebook_resolve_rail(_method, _rail) r;
  if _resolved_method = 'credit' then
    raise exception 'A deposit cannot itself be on credit.' using errcode = 'B0001';
  end if;

  if _idempotency_key is not null then
    select id into _payment_id from public.payments
      where business_id = _business_id and idempotency_key = _idempotency_key limit 1;
    if found then
      select id into _instalment_id from public.layby_instalments where payment_id = _payment_id limit 1;
      return coalesce(_instalment_id, _payment_id);
    end if;
  end if;

  select * into _layby from public.laybys
    where id = _layby_id and business_id = _business_id
    for update;
  if not found then
    raise exception 'That lay-by could not be found.' using errcode = 'B0001';
  end if;
  if _layby.status not in ('open', 'ready') then
    raise exception 'This lay-by is % and cannot take payments.', _layby.status using errcode = 'B0001';
  end if;
  _remaining := round(_layby.total - _layby.amount_paid, 2);
  if _remaining <= 0 then
    raise exception 'This lay-by is already paid in full.' using errcode = 'B0001';
  end if;
  if _amount > _remaining then
    raise exception 'Payment cannot be more than the outstanding balance.' using errcode = 'B0001';
  end if;

  if _resolved_method = 'cash' then
    if public.cash_open_session_id(_business_id) is null then
      raise exception 'Open the cash drawer before taking cash.' using errcode = 'B0001';
    end if;
  end if;

  insert into public.payments (
    business_id, customer_id, amount, method, rail, reference, idempotency_key, created_by
  ) values (
    _business_id, _layby.customer_id, _amount, _resolved_method, _resolved_rail,
    nullif(trim(coalesce(_reference, '')), ''), _idempotency_key, auth.uid()
  ) returning id into _payment_id;

  insert into public.layby_instalments (
    business_id, layby_id, amount, method, rail, reference, payment_id, created_by
  ) values (
    _business_id, _layby_id, _amount, _resolved_method, _resolved_rail,
    nullif(trim(coalesce(_reference, '')), ''), _payment_id, auth.uid()
  ) returning id into _instalment_id;

  update public.laybys
    set amount_paid = amount_paid + _amount,
        status = case
          when amount_paid + _amount >= total or amount_paid + _amount >= collect_after then 'ready'
          else status
        end,
        updated_at = now()
    where id = _layby_id;

  if _resolved_method = 'cash' then
    perform public.cash_post_movement(
      _business_id, 'pay_in', _amount, 'payment', _payment_id, 'Lay-by instalment'
    );
  end if;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary, new_values)
  values (
    _business_id, auth.uid(), 'payment.recorded', 'layby', _layby_id,
    'Lay-by instalment of ' || _amount || ' on ' || _layby.layby_number,
    jsonb_build_object('amount', _amount, 'payment_id', _payment_id)
  );

  return _instalment_id;
end;
$$;
revoke all on function public.record_layby_instalment(uuid, uuid, numeric, public.payment_method, text, text, text) from public, anon;
grant execute on function public.record_layby_instalment(uuid, uuid, numeric, public.payment_method, text, text, text) to authenticated;

create or replace function public.apply_customer_deposit(
  _business_id uuid,
  _deposit_id uuid,
  _target text,
  _layby_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _deposit public.customer_deposits;
  _customer public.customers;
  _layby public.laybys;
  _apply numeric(14,2);
  _remaining numeric(14,2);
begin
  if not public.has_permission(_business_id, 'payments.record') then
    raise exception 'You do not have permission to record payments.' using errcode = 'B0002';
  end if;
  perform public.assert_business_can_operate(_business_id);
  if _target not in ('credit', 'layby') then
    raise exception 'Choose credit or lay-by for this deposit.' using errcode = 'B0001';
  end if;

  select * into _deposit
    from public.customer_deposits
    where id = _deposit_id and business_id = _business_id
    for update;
  if not found then
    raise exception 'That deposit could not be found.' using errcode = 'B0001';
  end if;
  if _deposit.status <> 'held' then
    raise exception 'Only a held deposit can be applied.' using errcode = 'B0001';
  end if;

  if _target = 'credit' then
    select * into _customer from public.customers
      where id = _deposit.customer_id and business_id = _business_id
      for update;
    if _customer.outstanding_balance <= 0 then
      raise exception 'This customer does not owe anything.' using errcode = 'B0001';
    end if;
    if _deposit.amount > _customer.outstanding_balance then
      raise exception 'Payment cannot be more than the outstanding balance.' using errcode = 'B0001';
    end if;
    update public.customers
      set outstanding_balance = greatest(outstanding_balance - _deposit.amount, 0)
      where id = _deposit.customer_id;
    update public.customer_deposits
      set status = 'applied', applied_to = 'credit', updated_at = now()
      where id = _deposit_id;
  else
    if _layby_id is null then
      raise exception 'That lay-by could not be found.' using errcode = 'B0001';
    end if;
    select * into _layby from public.laybys
      where id = _layby_id and business_id = _business_id and customer_id = _deposit.customer_id
      for update;
    if not found then
      raise exception 'That lay-by could not be found.' using errcode = 'B0001';
    end if;
    if _layby.status not in ('open', 'ready') then
      raise exception 'This lay-by is % and cannot take payments.', _layby.status using errcode = 'B0001';
    end if;
    _remaining := round(_layby.total - _layby.amount_paid, 2);
    if _remaining <= 0 then
      raise exception 'This lay-by is already paid in full.' using errcode = 'B0001';
    end if;
    if _deposit.amount > _remaining then
      raise exception 'Payment cannot be more than the outstanding balance.' using errcode = 'B0001';
    end if;
    _apply := _deposit.amount;
    insert into public.layby_instalments (
      business_id, layby_id, amount, method, rail, reference, payment_id, deposit_id, created_by
    ) values (
      _business_id, _layby_id, _apply, _deposit.method, _deposit.rail, _deposit.reference,
      _deposit.payment_id, _deposit_id, auth.uid()
    );
    update public.laybys
      set amount_paid = amount_paid + _apply,
          status = case
            when amount_paid + _apply >= total or amount_paid + _apply >= collect_after then 'ready'
            else status
          end,
          updated_at = now()
      where id = _layby_id;
    update public.customer_deposits
      set status = 'applied', applied_to = 'layby', layby_id = _layby_id, updated_at = now()
      where id = _deposit_id;
  end if;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary, new_values)
  values (
    _business_id, auth.uid(), 'payment.recorded', 'customer', _deposit.customer_id,
    'Applied deposit of ' || _deposit.amount || ' to ' || _target,
    jsonb_build_object('deposit_id', _deposit_id, 'target', _target, 'layby_id', _layby_id)
  );

  return _deposit_id;
end;
$$;
revoke all on function public.apply_customer_deposit(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.apply_customer_deposit(uuid, uuid, text, uuid) to authenticated;

create or replace function public.collect_layby(
  _business_id uuid,
  _layby_id uuid,
  _location_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _layby public.laybys;
  _item record;
  _product public.products;
  _sale_id uuid;
  _seq int;
  _number text;
  _resolved_location uuid;
  _allow_negative boolean;
  _stock_before numeric(14,3);
  _stock_after numeric(14,3);
  _remaining numeric(14,2);
  _method public.payment_method;
  _cost_total numeric(14,2) := 0;
begin
  if not public.has_permission(_business_id, 'sales.create') then
    raise exception 'You do not have permission to record sales.' using errcode = 'B0002';
  end if;
  perform public.assert_business_can_operate(_business_id);

  select * into _layby from public.laybys
    where id = _layby_id and business_id = _business_id
    for update;
  if not found then
    raise exception 'That lay-by could not be found.' using errcode = 'B0001';
  end if;
  if _layby.status = 'collected' then
    return _layby.sale_id;
  end if;
  if _layby.status = 'cancelled' then
    raise exception 'This lay-by is cancelled and cannot be collected.' using errcode = 'B0001';
  end if;
  if _layby.amount_paid < _layby.collect_after then
    raise exception 'This lay-by is not ready to collect yet.' using errcode = 'B0001';
  end if;

  _remaining := round(_layby.total - _layby.amount_paid, 2);
  if _remaining < 0 then
    _remaining := 0;
  end if;
  if _remaining > 0 then
    _method := 'credit';
  else
    select method into _method
      from public.layby_instalments
      where layby_id = _layby_id
      order by created_at desc
      limit 1;
    if _method is null then
      _method := 'cash';
    end if;
  end if;

  _resolved_location := public.resolve_location_id(_business_id, _location_id);
  select allow_negative_stock into _allow_negative from public.business_settings where business_id = _business_id;

  insert into public.business_counters (business_id) values (_business_id)
    on conflict (business_id) do nothing;
  update public.business_counters set sale_seq = sale_seq + 1
    where business_id = _business_id returning sale_seq into _seq;
  _number := 'S-' || lpad(_seq::text, 4, '0');

  insert into public.sales (
    business_id, sale_number, customer_id, payment_method, status, notes,
    created_by, location_id, subtotal, tax, total, discount, amount_paid
  ) values (
    _business_id, _number, _layby.customer_id, _method, 'completed',
    'Collected lay-by ' || _layby.layby_number, auth.uid(), _resolved_location,
    _layby.subtotal, _layby.tax, _layby.total, 0, _layby.amount_paid
  ) returning id into _sale_id;

  for _item in
    select * from public.layby_items where layby_id = _layby_id
  loop
    select * into _product from public.products
      where id = _item.product_id and business_id = _business_id and deleted_at is null
      for update;
    if not found then
      raise exception 'One of the items in this sale could not be found.' using errcode = 'B0001';
    end if;
    _stock_before := public.get_location_stock(_product.id, _resolved_location);
    _stock_after := _stock_before - _item.quantity;
    if _stock_after < 0 and not coalesce(_allow_negative, false) then
      raise exception 'Not enough stock for %. Only % left.', _product.name, _stock_before
        using errcode = 'B0001';
    end if;
    insert into public.sale_items (
      business_id, sale_id, product_id, name, sku, quantity, unit_price, cost_price, discount, tax, line_total
    ) values (
      _business_id, _sale_id, _product.id, _item.name, _product.sku, _item.quantity, _item.unit_price,
      _product.cost_price, 0, _item.tax, _item.line_total
    );
    perform public.apply_stock_delta(_business_id, _product.id, _resolved_location, -_item.quantity);
    insert into public.inventory_movements (
      business_id, product_id, location_id, movement_type, quantity, stock_before, stock_after,
      reference_type, reference_id, created_by
    ) values (
      _business_id, _product.id, _resolved_location, 'sale', -_item.quantity, _stock_before, _stock_after,
      'sale', _sale_id, auth.uid()
    );
    _cost_total := _cost_total + round(_item.quantity * _product.cost_price, 2);
  end loop;

  update public.sales set cost_total = _cost_total where id = _sale_id;

  if _remaining > 0 then
    update public.customers
      set outstanding_balance = outstanding_balance + _remaining
      where id = _layby.customer_id;
  end if;

  -- Instalments already posted cash / payments. Do not cash_post_movement again.
  update public.laybys
    set status = 'collected', sale_id = _sale_id, updated_at = now()
    where id = _layby_id;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary, new_values)
  values (
    _business_id, auth.uid(), 'sale.created', 'sale', _sale_id,
    'Collected lay-by ' || _layby.layby_number || ' as ' || _number,
    jsonb_build_object('layby_id', _layby_id, 'remaining_credit', _remaining)
  );

  return _sale_id;
end;
$$;
revoke all on function public.collect_layby(uuid, uuid, uuid) from public, anon;
grant execute on function public.collect_layby(uuid, uuid, uuid) to authenticated;

create or replace function public.cancel_layby(
  _business_id uuid,
  _layby_id uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _layby public.laybys;
  _deposit_id uuid;
  _inst_method public.payment_method := 'cash';
  _inst_rail text := 'cash';
begin
  if not public.has_permission(_business_id, 'sales.create') then
    raise exception 'You do not have permission to record sales.' using errcode = 'B0002';
  end if;
  perform public.assert_business_can_operate(_business_id);

  select * into _layby from public.laybys
    where id = _layby_id and business_id = _business_id
    for update;
  if not found then
    raise exception 'That lay-by could not be found.' using errcode = 'B0001';
  end if;
  if _layby.status = 'collected' then
    raise exception 'A collected lay-by cannot be cancelled.' using errcode = 'B0001';
  end if;
  if _layby.status = 'cancelled' then
    return _layby_id;
  end if;

  if _layby.amount_paid > 0 then
    select method, coalesce(rail, public.default_rail_for_method(method))
      into _inst_method, _inst_rail
      from public.layby_instalments
      where layby_id = _layby_id
      order by created_at desc
      limit 1;
    insert into public.customer_deposits (
      business_id, customer_id, amount, status, method, rail, layby_id, created_by
    ) values (
      _business_id, _layby.customer_id, _layby.amount_paid, 'held',
      coalesce(_inst_method, 'cash'::public.payment_method),
      coalesce(_inst_rail, 'cash'),
      _layby_id, auth.uid()
    ) returning id into _deposit_id;
  end if;

  update public.laybys set status = 'cancelled', updated_at = now() where id = _layby_id;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary, new_values)
  values (
    _business_id, auth.uid(), 'sale.created', 'layby', _layby_id,
    'Cancelled lay-by ' || _layby.layby_number,
    jsonb_build_object('deposit_id', _deposit_id, 'amount_paid', _layby.amount_paid)
  );

  return _layby_id;
end;
$$;
revoke all on function public.cancel_layby(uuid, uuid) from public, anon;
grant execute on function public.cancel_layby(uuid, uuid) to authenticated;

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
          and p.supplier_id is null
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

create or replace function public.storefront_attach_marketplace_verified(_shops jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select jsonb_agg(tagged.shop order by tagged.ord)
    from (
      select
        shop || jsonb_build_object(
          'verified', exists (
            select 1
            from public.storefronts s
            join public.store_reviews r on r.business_id = s.business_id
            where s.slug = shop->>'slug'
              and r.status = 'published'
          )
        ) as shop,
        ord
      from jsonb_array_elements(coalesce(_shops, '[]'::jsonb)) with ordinality as t(shop, ord)
    ) tagged
  ), '[]'::jsonb);
$$;
revoke all on function public.storefront_attach_marketplace_verified(jsonb) from public, anon, authenticated;
grant execute on function public.storefront_attach_marketplace_verified(jsonb) to service_role;

create or replace function public.browse_marketplace(
  _query text default null,
  _category text default null,
  _limit int default 24,
  _offset int default 0
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _payload jsonb;
begin
  _payload := public.browse_marketplace_product_management_base(_query, _category, _limit, _offset);
  if _payload is null then
    return null;
  end if;
  _payload := public.storefront_filter_marketplace_payload(_payload);
  if _payload is null then
    return null;
  end if;
  _payload := jsonb_set(
    _payload,
    '{products}',
    public.storefront_apply_marketplace_names(_payload->'products'),
    true
  );
  _payload := jsonb_set(
    _payload,
    '{featured}',
    public.storefront_apply_marketplace_names(_payload->'featured'),
    true
  );
  _payload := jsonb_set(
    _payload,
    '{recent}',
    public.storefront_apply_marketplace_names(_payload->'recent'),
    true
  );
  return jsonb_set(
    _payload,
    '{shops}',
    public.storefront_attach_marketplace_verified(_payload->'shops'),
    true
  );
end;
$$;
revoke all on function public.browse_marketplace(text, text, int, int) from public;
grant execute on function public.browse_marketplace(text, text, int, int) to anon, authenticated;

comment on function public.record_supplier_payment(uuid, uuid, numeric, public.payment_method, text, text, text) is
  'Pays down suppliers.outstanding_amount. Cash posts pay_out. Excluded from daily takings.';
comment on function public.take_customer_deposit(uuid, uuid, numeric, public.payment_method, text, text, text) is
  'Holds a customer deposit. Not a sale and not an invoice.';
comment on function public.create_layby(uuid, uuid, jsonb, numeric, text) is
  'Opens a lay-by at catalogue selling_price. Stock is not deducted until collect_layby.';
comment on function public.collect_layby(uuid, uuid, uuid) is
  'Deducts stock and writes a sale. Does not post cash again — instalments already hit the till.';
comment on function public.browse_marketplace(text, text, int, int) is
  'Public marketplace. verified on a shop means a published verified-purchase review, not KYC or a government licence.';
