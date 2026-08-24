-- Wires the previously-unused suppliers table into product creation, and
-- adds a total-registered-users count to the platform admin dashboard.

-- create or replace does NOT replace a function whose argument list changed
-- (Postgres identifies a function by its full type signature) — adding
-- _supplier_id here would otherwise leave the old 11-arg version in place
-- as a second overload, and any 11-arg caller (raw SQL, older RPCs) would
-- then fail with "function ... is not unique". Drop the old signature
-- explicitly first.
drop function if exists public.create_product(uuid, text, text, text, text, numeric, numeric, numeric, numeric, numeric, text);

create or replace function public.create_product(
  _business_id uuid,
  _name text,
  _sku text,
  _barcode text,
  _unit text,
  _cost_price numeric,
  _selling_price numeric,
  _stock numeric,
  _min_stock numeric,
  _tax_rate numeric,
  _description text,
  _supplier_id uuid default null
) returns table(id uuid, name text, stock numeric)
language plpgsql security definer set search_path = public as $$
declare
  _product_id uuid;
begin
  if not public.has_business_role(_business_id, array['owner','admin','manager']::public.app_role[]) then
    raise exception 'Your role does not allow this action.' using errcode = 'B0002';
  end if;

  insert into public.products (
    business_id, name, sku, barcode, unit, cost_price, selling_price, stock, min_stock, tax_rate, description, supplier_id
  ) values (
    _business_id, _name, nullif(_sku, ''), nullif(_barcode, ''), coalesce(nullif(_unit, ''), 'unit'),
    _cost_price, _selling_price, _stock, _min_stock, _tax_rate, nullif(_description, ''), _supplier_id
  ) returning products.id into _product_id;

  if _stock > 0 then
    insert into public.inventory_movements (
      business_id, product_id, movement_type, quantity, stock_before, stock_after, reason, created_by
    ) values (
      _business_id, _product_id, 'stock_in', _stock, 0, _stock, 'Opening stock', auth.uid()
    );
  end if;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary, new_values)
  values (
    _business_id, auth.uid(), 'product.created', 'product', _product_id,
    'Added product ' || _name,
    jsonb_build_object('name', _name, 'selling_price', _selling_price, 'stock', _stock)
  );

  return query select p.id, p.name, p.stock from public.products p where p.id = _product_id;
end;
$$;

create or replace function public.admin_platform_stats()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'businesses_total', (select count(*) from public.businesses),
    'users_total', (select count(*) from auth.users),
    'businesses_by_status', (
      select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
      from (select status, count(*) n from public.subscriptions group by status) t
    ),
    'businesses_by_plan', (
      select coalesce(jsonb_object_agg(plan, n), '{}'::jsonb)
      from (select plan, count(*) n from public.subscriptions group by plan) t
    ),
    'signups_last_30_days', (
      select count(*) from public.businesses where created_at > now() - interval '30 days'
    ),
    'payments_paid_total', (
      select coalesce(sum(amount), 0) from public.subscription_payments where status = 'paid'
    ),
    'payments_paid_count', (
      select count(*) from public.subscription_payments where status = 'paid'
    ),
    'payments_failed_count', (
      select count(*) from public.subscription_payments where status = 'failed'
    ),
    'payments_stuck_count', (
      select count(*) from public.subscription_payments
      where status = 'created' and created_at < now() - interval '1 hour'
    )
  );
$$;
revoke all on function public.admin_platform_stats() from public, anon, authenticated;
grant execute on function public.admin_platform_stats() to service_role;

-- Extends the audit_logs action allow-list (20260811000000_data_export.sql)
-- for the three new supplier actions — without this, recordAudit's insert
-- fails the check constraint on every supplier create/update/delete (caught
-- and logged, not thrown, per recordAudit's existing fail-open behavior,
-- but that means audit history for suppliers was silently never recorded).
alter table public.audit_logs drop constraint if exists audit_logs_action_check;
alter table public.audit_logs
  add constraint audit_logs_action_check check (
    action in (
      'business.created', 'product.created', 'products.imported',
      'inventory.adjusted', 'customer.created', 'quote.status_changed',
      'expense.created', 'expense.deleted', 'expenses.imported', 'sales.imported',
      'sale.created', 'invoice.created', 'invoice.status_changed',
      'payment.recorded', 'quote.created', 'quote.converted', 'data.exported',
      'supplier.created', 'supplier.updated', 'supplier.deleted'
    )
  );
