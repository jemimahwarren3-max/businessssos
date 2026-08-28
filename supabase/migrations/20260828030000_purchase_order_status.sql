-- The status-change workflow purchase_orders.sql (20260814030000) left the
-- enum room for: marking a PO "received" now actually adjusts stock (a
-- stock_in movement per line item with a linked product — items without one
-- can't affect inventory, same limitation adjust_stock already has), not
-- just flipping a label. Only 'sent' -> 'received'/'cancelled' is allowed;
-- once received or cancelled, a PO is final.

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
  end if;

  update public.purchase_orders set status = _status where id = _po_id;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary, old_values, new_values)
  values (
    _business_id, auth.uid(), 'purchase_order.status_changed', 'purchase_order', _po_id,
    _po.po_number || ': ' || _po.status || ' -> ' || _status,
    jsonb_build_object('status', _po.status), jsonb_build_object('status', _status)
  );
end;
$$;
revoke all on function public.set_purchase_order_status(uuid, uuid, public.purchase_order_status) from public, anon;
grant execute on function public.set_purchase_order_status(uuid, uuid, public.purchase_order_status) to authenticated;

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
      'team.permission_changed', 'purchase_order.status_changed'
    )
  );
