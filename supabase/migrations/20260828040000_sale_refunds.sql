-- Refunds/returns. sale_status has had 'refunded'/'partially_refunded' since
-- the schema was first created — nothing has ever set them (confirmed: no
-- refund/void code anywhere in src/). This adds the real workflow: a ledger
-- of refund events (never mutating the original sale_items — that stays the
-- true record of what was actually sold), stock restored per returned item,
-- and the parent sale's totals reduced so it keeps meaning "what the
-- customer actually ended up owing/paying" post-return.
--
-- A refund can't touch public.payments — its amount column is `check
-- (amount > 0)`, payments is money coming in, not going out. Cash refunds
-- instead reduce sales.amount_paid directly; credit-sale refunds reduce the
-- customer's outstanding_balance. sale_refunds itself is the audit trail of
-- money going back out, same role payments plays for money coming in.

create table public.sale_refunds (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  subtotal numeric(14,2) not null default 0,
  tax numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  reason text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.sale_refund_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  sale_refund_id uuid not null references public.sale_refunds(id) on delete cascade,
  sale_item_id uuid not null references public.sale_items(id) on delete cascade,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null,
  tax numeric(14,2) not null default 0,
  line_total numeric(14,2) not null
);
create index sale_refunds_sale_idx on public.sale_refunds(sale_id);
create index sale_refund_items_refund_idx on public.sale_refund_items(sale_refund_id);
create index sale_refund_items_sale_item_idx on public.sale_refund_items(sale_item_id);

alter table public.sale_refunds enable row level security;
alter table public.sale_refund_items enable row level security;

-- Read: any member (same as sales itself). Write: only through
-- refund_sale() below (security definer, its own role check) — no direct
-- insert/update policy, matching create_sale/create_purchase_order's own
-- RPC-only write pattern for records with real financial/stock side effects.
create policy "members read sale_refunds" on public.sale_refunds for select to authenticated
  using (public.is_business_member(business_id));
create policy "members read sale_refund_items" on public.sale_refund_items for select to authenticated
  using (public.is_business_member(business_id));

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
      raise exception '% of % has already been refunded — % is left to refund.',
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

  update public.sales set
    subtotal = greatest(subtotal - _refund_subtotal, 0),
    tax = greatest(tax - _refund_tax, 0),
    cost_total = greatest(cost_total - _refund_cost, 0),
    total = _new_total,
    amount_paid = case when payment_method = 'credit' then amount_paid else least(amount_paid, _new_total) end,
    status = case when _fully_refunded then 'refunded'::public.sale_status else 'partially_refunded'::public.sale_status end
    where id = _sale_id;

  if _sale.payment_method = 'credit' and _sale.customer_id is not null then
    update public.customers
      set outstanding_balance = greatest(outstanding_balance - _refund_total, 0)
      where id = _sale.customer_id;
  end if;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary, old_values, new_values)
  values (
    _business_id, auth.uid(), 'sale.refunded', 'sale', _sale_id,
    _sale.sale_number || ': refunded ' || _refund_total,
    jsonb_build_object('total', _sale.total, 'status', _sale.status),
    jsonb_build_object('total', _new_total, 'status', case when _fully_refunded then 'refunded' else 'partially_refunded' end)
  );

  return _refund_id;
end;
$$;
revoke all on function public.refund_sale(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.refund_sale(uuid, uuid, jsonb, text) to authenticated;

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
      'purchase_order.created', 'sales.imported_detailed', 'customers.imported',
      'team.invited', 'team.invite_revoked', 'team.role_changed', 'team.member_removed',
      'team.staff_created', 'team.staff_password_reset', 'team.shop_password_set',
      'team.permission_changed', 'purchase_order.status_changed', 'sale.refunded'
    )
  );
