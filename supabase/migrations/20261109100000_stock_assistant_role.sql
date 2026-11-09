-- Stock assistant: view inventory, adjust stock, no sales/finance/team.

alter type public.app_role add value if not exists 'stock_assistant';

insert into public.permissions (key, category, label) values
  ('inventory.view', 'Inventory', 'View products and stock levels'),
  ('inventory.adjust', 'Inventory', 'Adjust stock in and out')
on conflict (key) do nothing;

insert into public.business_role_permissions (business_id, role, permission_key)
select seeded.business_id, grants.role, grants.permission_key
from (select distinct business_id from public.business_role_permissions) seeded
cross join (
  values
    ('admin'::public.app_role, 'inventory.view'),
    ('manager'::public.app_role, 'inventory.view'),
    ('admin'::public.app_role, 'inventory.adjust'),
    ('manager'::public.app_role, 'inventory.adjust'),
    ('stock_assistant'::public.app_role, 'inventory.view'),
    ('stock_assistant'::public.app_role, 'inventory.adjust')
) as grants(role, permission_key)
on conflict (business_id, role, permission_key) do nothing;

create or replace function public.seed_default_role_permissions(_business_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.business_role_permissions where business_id = _business_id) then
    return;
  end if;
  insert into public.business_role_permissions (business_id, role, permission_key)
  select _business_id, d.role, d.permission_key from (values
    ('admin'::public.app_role, 'sales.create'), ('manager'::public.app_role, 'sales.create'), ('cashier'::public.app_role, 'sales.create'),
    ('admin'::public.app_role, 'sales.import'), ('manager'::public.app_role, 'sales.import'), ('accountant'::public.app_role, 'sales.import'),
    ('admin'::public.app_role, 'payments.record'), ('manager'::public.app_role, 'payments.record'), ('cashier'::public.app_role, 'payments.record'), ('accountant'::public.app_role, 'payments.record'),
    ('admin'::public.app_role, 'inventory.import'), ('manager'::public.app_role, 'inventory.import'),
    ('admin'::public.app_role, 'inventory.view'), ('manager'::public.app_role, 'inventory.view'),
    ('admin'::public.app_role, 'inventory.adjust'), ('manager'::public.app_role, 'inventory.adjust'),
    ('stock_assistant'::public.app_role, 'inventory.view'), ('stock_assistant'::public.app_role, 'inventory.adjust'),
    ('admin'::public.app_role, 'customers.create'), ('manager'::public.app_role, 'customers.create'), ('cashier'::public.app_role, 'customers.create'), ('accountant'::public.app_role, 'customers.create'),
    ('admin'::public.app_role, 'customers.import'), ('manager'::public.app_role, 'customers.import'), ('cashier'::public.app_role, 'customers.import'), ('accountant'::public.app_role, 'customers.import'),
    ('admin'::public.app_role, 'customers.order'), ('manager'::public.app_role, 'customers.order'), ('accountant'::public.app_role, 'customers.order'),
    ('admin'::public.app_role, 'suppliers.view'), ('manager'::public.app_role, 'suppliers.view'),
    ('admin'::public.app_role, 'suppliers.create'), ('manager'::public.app_role, 'suppliers.create'),
    ('admin'::public.app_role, 'suppliers.edit'), ('manager'::public.app_role, 'suppliers.edit'),
    ('admin'::public.app_role, 'suppliers.delete'), ('manager'::public.app_role, 'suppliers.delete'),
    ('admin'::public.app_role, 'purchase_orders.create'), ('manager'::public.app_role, 'purchase_orders.create'),
    ('admin'::public.app_role, 'invoices.manage'), ('manager'::public.app_role, 'invoices.manage'), ('accountant'::public.app_role, 'invoices.manage'),
    ('admin'::public.app_role, 'quotes.manage'), ('manager'::public.app_role, 'quotes.manage'), ('accountant'::public.app_role, 'quotes.manage'),
    ('admin'::public.app_role, 'expenses.create'), ('manager'::public.app_role, 'expenses.create'), ('accountant'::public.app_role, 'expenses.create'),
    ('admin'::public.app_role, 'expenses.delete'),
    ('admin'::public.app_role, 'expenses.import'), ('manager'::public.app_role, 'expenses.import'), ('accountant'::public.app_role, 'expenses.import'),
    ('admin'::public.app_role, 'reports.financial'), ('manager'::public.app_role, 'reports.financial'), ('accountant'::public.app_role, 'reports.financial'),
    ('admin'::public.app_role, 'ai.use'), ('manager'::public.app_role, 'ai.use'), ('accountant'::public.app_role, 'ai.use'),
    ('admin'::public.app_role, 'users.view'),
    ('admin'::public.app_role, 'users.invite'),
    ('admin'::public.app_role, 'users.manage'),
    ('admin'::public.app_role, 'users.remove'),
    ('admin'::public.app_role, 'roles.manage'),
    ('admin'::public.app_role, 'business.settings'),
    ('admin'::public.app_role, 'business.billing'),
    ('admin'::public.app_role, 'business.export_data'),
    ('admin'::public.app_role, 'orders.manage'),
    ('manager'::public.app_role, 'orders.manage')
  ) as d(role, permission_key);
end;
$$;
revoke all on function public.seed_default_role_permissions(uuid) from public;

create or replace function public.adjust_stock(
  _business_id uuid,
  _product_id uuid,
  _movement_type public.movement_type,
  _quantity numeric,
  _reason text,
  _location_id uuid default null
) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  _product public.products;
  _allow_negative boolean;
  _signed numeric(14,3);
  _before numeric(14,3);
  _after numeric(14,3);
  _resolved_location uuid;
begin
  if not public.has_permission(_business_id, 'inventory.adjust') then
    raise exception 'Your role does not allow this action.' using errcode = 'B0002';
  end if;
  if _quantity is null or _quantity <= 0 then
    raise exception 'Quantity must be greater than zero.' using errcode = 'B0001';
  end if;

  select * into _product from public.products
    where id = _product_id and business_id = _business_id and deleted_at is null
    for update;
  if not found then
    raise exception 'That product could not be found.' using errcode = 'B0001';
  end if;

  _resolved_location := public.resolve_location_id(_business_id, _location_id);
  _signed := case when _movement_type = 'stock_out' then -_quantity else _quantity end;
  _before := public.get_location_stock(_product_id, _resolved_location);
  _after := _before + _signed;

  select allow_negative_stock into _allow_negative
    from public.business_settings where business_id = _business_id;
  if _after < 0 and not coalesce(_allow_negative, false) then
    raise exception 'Not enough stock. % only has % left.', _product.name, _before using errcode = 'B0001';
  end if;

  perform public.apply_stock_delta(_business_id, _product_id, _resolved_location, _signed);

  insert into public.inventory_movements (
    business_id, product_id, location_id, movement_type, quantity, stock_before, stock_after, reason, created_by
  ) values (
    _business_id, _product.id, _resolved_location, _movement_type, _signed, _before, _after, nullif(trim(_reason), ''), auth.uid()
  );

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary, old_values, new_values)
  values (
    _business_id, auth.uid(), 'inventory.adjusted', 'product', _product.id,
    _product.name || ': stock ' || _before || ' -> ' || _after,
    jsonb_build_object('stock', _before), jsonb_build_object('stock', _after, 'movement', _movement_type)
  );

  return _after;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'sales', 'sale_items', 'expenses', 'payments', 'invoices', 'invoice_items',
    'quotes', 'quote_items', 'customers'
  ]
  loop
    execute format('drop policy if exists "members read %1$s" on public.%1$I', t);
    execute format(
      'create policy "members read %1$s" on public.%1$I for select to authenticated
        using (
          public.is_business_member(business_id)
          and not public.has_business_role(business_id, array[''stock_assistant'']::public.app_role[])
        )',
      t
    );
  end loop;
end $$;
