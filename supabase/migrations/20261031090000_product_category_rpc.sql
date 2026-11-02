-- Add _category_id parameter to create_product RPC
-- The products table already has `category_id uuid references categories(id)`;
-- this migration updates the RPC to accept and pass through the category.

drop function if exists public.create_product(uuid, text, text, text, text, numeric, numeric, numeric, numeric, numeric, text, uuid, uuid);

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
  _supplier_id uuid default null,
  _location_id uuid default null,
  _category_id uuid default null
) returns table(id uuid, name text, stock numeric)
language plpgsql security definer set search_path = public as $$
declare
  _product_id uuid;
  _resolved_location uuid;
begin
  if not public.has_business_role(_business_id, array['owner','admin','manager']::public.app_role[]) then
    raise exception 'Your role does not allow this action.' using errcode = 'B0002';
  end if;

  _resolved_location := public.resolve_location_id(_business_id, _location_id);

  insert into public.products (
    business_id, name, sku, barcode, unit, cost_price, selling_price, stock, min_stock, tax_rate, description, supplier_id, category_id
  ) values (
    _business_id, _name, nullif(_sku, ''), nullif(_barcode, ''), coalesce(nullif(_unit, ''), 'unit'),
    _cost_price, _selling_price, 0, _min_stock, _tax_rate, nullif(_description, ''), _supplier_id, _category_id
  ) returning products.id into _product_id;

  if _stock > 0 then
    perform public.apply_stock_delta(_business_id, _product_id, _resolved_location, _stock);
    insert into public.inventory_movements (
      business_id, product_id, location_id, movement_type, quantity, stock_before, stock_after, reason, created_by
    ) values (
      _business_id, _product_id, _resolved_location, 'stock_in', _stock, 0, _stock, 'Opening stock', auth.uid()
    );
  end if;

  return query select _product_id as id, _name as name, _stock as stock;
end;
$$;

revoke all on function public.create_product(uuid, text, text, text, text, numeric, numeric, numeric, numeric, numeric, text, uuid, uuid, uuid) from public, anon;
grant execute on function public.create_product(uuid, text, text, text, text, numeric, numeric, numeric, numeric, numeric, text, uuid, uuid, uuid) to authenticated;
