-- Lightweight purchase-order record for the Suppliers "Order" flow — modeled
-- directly on quotes/quote_items (same shape, same numbering pattern via
-- business_counters) since that's a proven working design already here.
-- No status-change workflow is built yet (the enum leaves room for one
-- later); this pass only needs a real, listable record.

create type public.purchase_order_status as enum ('sent', 'received', 'cancelled');

alter table public.business_counters add column po_seq integer not null default 0;

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  po_number text not null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  order_date date not null default current_date,
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  tax numeric(14,2) not null default 0 check (tax >= 0),
  total numeric(14,2) not null default 0 check (total >= 0),
  status public.purchase_order_status not null default 'sent',
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, po_number)
);
create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost numeric(14,2) not null check (unit_cost >= 0),
  tax numeric(14,2) not null default 0 check (tax >= 0),
  line_total numeric(14,2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);
create index purchase_order_items_po_idx on public.purchase_order_items(purchase_order_id);
create index purchase_orders_business_idx on public.purchase_orders(business_id);

alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;

-- Same two-policy shape as suppliers/products: any member can read, only
-- owner/admin/manager can write (matches Suppliers' own access level, not
-- quotes' broader +accountant, since this is supplier-side).
create policy "members read purchase_orders" on public.purchase_orders for select to authenticated
  using (public.is_business_member(business_id));
create policy "members read purchase_order_items" on public.purchase_order_items for select to authenticated
  using (public.is_business_member(business_id));
create policy "staff manage purchase_orders" on public.purchase_orders for all to authenticated
  using (public.has_business_role(business_id, array['owner','admin','manager']::public.app_role[]))
  with check (public.has_business_role(business_id, array['owner','admin','manager']::public.app_role[]));
create policy "staff manage purchase_order_items" on public.purchase_order_items for all to authenticated
  using (public.has_business_role(business_id, array['owner','admin','manager']::public.app_role[]))
  with check (public.has_business_role(business_id, array['owner','admin','manager']::public.app_role[]));

create trigger purchase_orders_updated before update on public.purchase_orders
  for each row execute function public.set_updated_at();

create or replace function public.create_purchase_order(
  _business_id uuid,
  _supplier_id uuid,
  _order_date date,
  _notes text,
  _items jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _po_id uuid;
  _seq int;
  _number text;
  _subtotal numeric(14,2) := 0;
  _tax numeric(14,2) := 0;
  _total numeric(14,2);
  _item jsonb;
  _line_subtotal numeric(14,2);
  _line_tax numeric(14,2);
  _qty numeric(14,3);
  _cost numeric(14,2);
begin
  if not public.has_business_role(_business_id, array['owner','admin','manager']::public.app_role[]) then
    raise exception 'You do not have permission to create purchase orders.' using errcode = 'B0002';
  end if;
  if _items is null or jsonb_array_length(_items) = 0 then
    raise exception 'A purchase order needs at least one item.' using errcode = 'B0001';
  end if;
  if _supplier_id is not null and not exists (
    select 1 from public.suppliers where id = _supplier_id and business_id = _business_id and deleted_at is null
  ) then
    raise exception 'That supplier could not be found.' using errcode = 'B0001';
  end if;

  insert into public.business_counters (business_id) values (_business_id)
    on conflict (business_id) do nothing;
  update public.business_counters set po_seq = po_seq + 1
    where business_id = _business_id returning po_seq into _seq;
  _number := 'PO-' || lpad(_seq::text, 4, '0');

  insert into public.purchase_orders (
    business_id, po_number, supplier_id, order_date, notes, status, created_by
  ) values (
    _business_id, _number, _supplier_id, coalesce(_order_date, current_date),
    nullif(trim(_notes), ''), 'sent', auth.uid()
  ) returning id into _po_id;

  for _item in select * from jsonb_array_elements(_items)
  loop
    _qty := (_item->>'quantity')::numeric;
    _cost := (_item->>'unitPrice')::numeric;
    if _qty is null or _qty <= 0 then
      raise exception 'Item quantity must be greater than zero.' using errcode = 'B0001';
    end if;
    if _cost is null or _cost < 0 then
      raise exception 'Item cost cannot be negative.' using errcode = 'B0001';
    end if;
    _line_subtotal := round(_qty * _cost, 2);
    _line_tax := round(_line_subtotal * coalesce((_item->>'taxRate')::numeric, 0) / 100, 2);
    insert into public.purchase_order_items (
      business_id, purchase_order_id, product_id, name, quantity, unit_cost, tax, line_total
    ) values (
      _business_id, _po_id, nullif(_item->>'productId', '')::uuid,
      _item->>'name', _qty, _cost, _line_tax, _line_subtotal + _line_tax
    );
    _subtotal := _subtotal + _line_subtotal;
    _tax := _tax + _line_tax;
  end loop;

  _total := _subtotal + _tax;
  update public.purchase_orders set subtotal = _subtotal, tax = _tax, total = _total where id = _po_id;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary, new_values)
  values (_business_id, auth.uid(), 'purchase_order.created', 'purchase_order', _po_id,
    'Created purchase order ' || _number, jsonb_build_object('total', _total, 'status', 'sent'));

  return _po_id;
end;
$$;
revoke all on function public.create_purchase_order(uuid,uuid,date,text,jsonb) from public, anon;
grant execute on function public.create_purchase_order(uuid,uuid,date,text,jsonb) to authenticated;

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
      'purchase_order.created'
    )
  );
