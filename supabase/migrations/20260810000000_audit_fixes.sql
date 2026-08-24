-- Fixes from the full-app audit (security posture, data integrity, code
-- quality passes). Each block is independently safe to re-run.

-- ============ S1: drop orphaned create_business_with_owner overload ============
-- The 7-arg version (added for a timezone/tax-mode feature that was reverted
-- from the app itself) was never dropped. It still grants the pre-repricing
-- 14-day/'business'-plan trial and was never given the anon/authenticated
-- revoke every other function now has — callable directly via supabase.rpc()
-- to bypass the single-plan pricing entirely. The app has only ever called
-- the 5-arg version (src/lib/business.server.ts).
drop function if exists public.create_business_with_owner(text, public.business_type, text, text, text, text, text);

-- ============ S2: explicit anon revoke on RLS helper functions ============
-- These already revoke from public and grant to authenticated/service_role
-- (correct — RLS policies evaluate as the authenticated role), but predate
-- the grant-leak fix and never got an explicit anon revoke.
revoke all on function public.is_business_member(uuid) from anon;
revoke all on function public.has_business_role(uuid, public.app_role[]) from anon;
revoke all on function public.my_role(uuid) from anon;

-- ============ S4: audit_logs can't be forged with arbitrary content ============
-- "members append audit" (any business member, any role) is intentional —
-- src/lib/business.server.ts's recordAudit() writes through the RLS-scoped
-- client from several create/update paths. But nothing constrained *what*
-- could be inserted: a low-privilege member could claim any action/result.
-- Restrict to every action string actually written anywhere in the app —
-- both recordAudit()'s client-side calls AND the SECURITY DEFINER RPCs
-- (create_sale/create_invoice/create_quote/etc.) that insert audit_logs
-- directly — without touching the insert policy itself.
alter table public.audit_logs
  add constraint audit_logs_action_check check (
    action in (
      'business.created', 'product.created', 'products.imported',
      'inventory.adjusted', 'customer.created', 'quote.status_changed',
      'expense.created', 'expense.deleted', 'expenses.imported', 'sales.imported',
      'sale.created', 'invoice.created', 'invoice.status_changed',
      'payment.recorded', 'quote.created', 'quote.converted'
    )
  );
alter table public.audit_logs
  add constraint audit_logs_result_check check (result in ('success', 'failure'));

-- ============ C1: drop orphaned bootstrap_business_subscription ============
-- Superseded by create_business_with_owner, which now inserts the
-- subscription row itself atomically. Never called from the app, still
-- grantable to authenticated, and still hardcodes plan := 'business' — a
-- tier that no longer exists under single-plan pricing.
drop function if exists public.bootstrap_business_subscription(uuid);

-- ============ D4: inventory_movements.product_id shouldn't cascade-delete ============
-- sale_items/invoice_items/quote_items.product_id are all `on delete set
-- null` to preserve the record; inventory_movements was the one table still
-- set to `on delete cascade`. Not exploitable today (no hard-delete path for
-- products exists), but fixing proactively before one is ever added — a
-- product hard-delete shouldn't be able to wipe its own stock-history audit
-- trail while the sales referencing it survive untouched.
alter table public.inventory_movements alter column product_id drop not null;
alter table public.inventory_movements drop constraint inventory_movements_product_id_fkey;
alter table public.inventory_movements
  add constraint inventory_movements_product_id_fkey
  foreign key (product_id) references public.products(id) on delete set null;

-- ============ D1/D2: adjust_stock — atomic, row-locked ============
-- Previously four sequential plain client calls in adjustStock()
-- (src/lib/business.server.ts) with no transaction and no row lock — two
-- concurrent adjustments to the same product could lose an update, and a
-- failure between the stock update and the movement insert could change
-- stock with no record explaining why. One atomic function, matching the
-- create_sale/create_invoice pattern: `select ... for update` serializes
-- concurrent adjustments instead of racing.
create or replace function public.adjust_stock(
  _business_id uuid,
  _product_id uuid,
  _movement_type public.movement_type,
  _quantity numeric,
  _reason text
) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  _product public.products;
  _allow_negative boolean;
  _signed numeric(14,3);
  _before numeric(14,3);
  _after numeric(14,3);
begin
  if not public.has_business_role(_business_id, array['owner','admin','manager']::public.app_role[]) then
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

  _signed := case when _movement_type = 'stock_out' then -_quantity else _quantity end;
  _before := _product.stock;
  _after := _before + _signed;

  select allow_negative_stock into _allow_negative
    from public.business_settings where business_id = _business_id;
  if _after < 0 and not coalesce(_allow_negative, false) then
    raise exception 'Not enough stock. % only has % left.', _product.name, _before using errcode = 'B0001';
  end if;

  update public.products set stock = _after where id = _product.id;

  insert into public.inventory_movements (
    business_id, product_id, movement_type, quantity, stock_before, stock_after, reason, created_by
  ) values (
    _business_id, _product.id, _movement_type, _signed, _before, _after, nullif(trim(_reason), ''), auth.uid()
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
revoke all on function public.adjust_stock(uuid, uuid, public.movement_type, numeric, text) from public, anon, authenticated;
grant execute on function public.adjust_stock(uuid, uuid, public.movement_type, numeric, text) to authenticated;

-- ============ D3: create_product — atomic (product + opening stock) ============
-- Previously two separate calls with the second's error not even checked —
-- a product could end up with a stock count and zero movement history
-- explaining it. One atomic function, matching create_sale/create_invoice.
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
  _description text
) returns table(id uuid, name text, stock numeric)
language plpgsql security definer set search_path = public as $$
declare
  _product_id uuid;
begin
  if not public.has_business_role(_business_id, array['owner','admin','manager']::public.app_role[]) then
    raise exception 'Your role does not allow this action.' using errcode = 'B0002';
  end if;

  insert into public.products (
    business_id, name, sku, barcode, unit, cost_price, selling_price, stock, min_stock, tax_rate, description
  ) values (
    _business_id, _name, nullif(_sku, ''), nullif(_barcode, ''), coalesce(nullif(_unit, ''), 'unit'),
    _cost_price, _selling_price, _stock, _min_stock, _tax_rate, nullif(_description, '')
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
revoke all on function public.create_product(uuid, text, text, text, text, numeric, numeric, numeric, numeric, numeric, text) from public, anon, authenticated;
grant execute on function public.create_product(uuid, text, text, text, text, numeric, numeric, numeric, numeric, numeric, text) to authenticated;
