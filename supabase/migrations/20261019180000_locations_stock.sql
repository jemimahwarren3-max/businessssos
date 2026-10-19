-- Back-port staging locations / per-location stock into git. POS and the
-- shop still use the default location when the app does not send one.
-- Branch transfers are not implemented.

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  address text,
  phone text,
  is_active boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists locations_business_idx on public.locations (business_id);
create unique index if not exists locations_one_default_per_business
  on public.locations (business_id) where is_default;
drop trigger if exists locations_updated on public.locations;
create trigger locations_updated before update on public.locations
  for each row execute function public.set_updated_at();

create table if not exists public.product_stock (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  quantity numeric(14,3) not null default 0,
  unique (product_id, location_id)
);
create index if not exists product_stock_business_idx on public.product_stock (business_id);
create index if not exists product_stock_location_idx on public.product_stock (location_id);

alter table public.inventory_movements
  add column if not exists location_id uuid references public.locations(id) on delete set null;
alter table public.sales
  add column if not exists location_id uuid references public.locations(id) on delete set null;
alter table public.purchase_orders
  add column if not exists location_id uuid references public.locations(id) on delete set null;

alter table public.locations enable row level security;
alter table public.product_stock enable row level security;

revoke all on public.locations from anon, authenticated;
revoke all on public.product_stock from anon, authenticated;
grant select on public.locations to authenticated;
grant select on public.product_stock to authenticated;
grant all on public.locations to service_role;
grant all on public.product_stock to service_role;

drop policy if exists "members read locations" on public.locations;
create policy "members read locations" on public.locations
  for select to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "members read product_stock" on public.product_stock;
create policy "members read product_stock" on public.product_stock
  for select to authenticated
  using (public.is_business_member(business_id));

create or replace function public.resolve_location_id(_business_id uuid, _location_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _resolved uuid := _location_id;
begin
  if _resolved is null then
    select id into _resolved from public.locations
      where business_id = _business_id and is_default = true;
  end if;
  if not exists (
    select 1 from public.locations
    where id = _resolved and business_id = _business_id and is_active
  ) then
    raise exception 'That location could not be found.' using errcode = 'B0001';
  end if;
  return _resolved;
end;
$$;

create or replace function public.get_location_stock(_product_id uuid, _location_id uuid)
returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select quantity from public.product_stock
      where product_id = _product_id and location_id = _location_id),
    0
  );
$$;

create or replace function public.apply_stock_delta(
  _business_id uuid,
  _product_id uuid,
  _location_id uuid,
  _delta numeric
) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  _after numeric(14,3);
begin
  perform set_config('businessos.syncing_stock', '1', true);
  perform 1 from public.products where id = _product_id for update;
  insert into public.product_stock (business_id, product_id, location_id, quantity)
  values (_business_id, _product_id, _location_id, _delta)
  on conflict (product_id, location_id)
    do update set quantity = public.product_stock.quantity + excluded.quantity
  returning quantity into _after;

  update public.products set stock = (
    select coalesce(sum(quantity), 0) from public.product_stock where product_id = _product_id
  ) where id = _product_id;

  return _after;
end;
$$;

create or replace function public.sync_default_location_stock()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  _loc uuid;
  _delta numeric(14,3);
begin
  if current_setting('businessos.syncing_stock', true) = '1' then
    return new;
  end if;
  _delta := coalesce(new.stock, 0) - coalesce(old.stock, 0);
  if _delta = 0 then
    return new;
  end if;
  select id into _loc from public.locations
    where business_id = new.business_id and is_default and is_active;
  if _loc is null then
    return new;
  end if;
  insert into public.product_stock (business_id, product_id, location_id, quantity)
  values (new.business_id, new.id, _loc, _delta)
  on conflict (product_id, location_id)
    do update set quantity = public.product_stock.quantity + excluded.quantity;
  return new;
end;
$$;

drop trigger if exists products_sync_default_location_stock on public.products;
create trigger products_sync_default_location_stock
  after insert or update of stock on public.products
  for each row execute function public.sync_default_location_stock();

-- Products store the alert level on min_stock. The outbox migration
-- referenced low_stock_threshold (a business_settings column), which only
-- exploded once apply_stock_delta started updating products.stock.
create or replace function public.notify_low_stock()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.stock > new.min_stock then
    return new;
  end if;
  if old.stock is not null and old.stock <= old.min_stock then
    return new;
  end if;
  if exists (
    select 1 from public.notifications n
    where n.business_id = new.business_id
      and n.type = 'low_stock'
      and n.entity_id = new.id
      and n.is_read = false
  ) then
    return new;
  end if;

  insert into public.notifications (
    business_id, type, title, message, severity, link, entity_type, entity_id
  ) values (
    new.business_id,
    'low_stock',
    'Low stock: ' || left(new.name, 80),
    'On-hand is now ' || trim(both from to_char(new.stock, 'FM999999990.###')) ||
      ' (alert level ' || trim(both from to_char(new.min_stock, 'FM999999990.###')) || ').',
    'warning',
    '/inventory',
    'product',
    new.id
  );
  return new;
end;
$$;

insert into public.locations (business_id, name, is_default, is_active)
select b.id, 'Main', true, true
from public.businesses b
where not exists (select 1 from public.locations l where l.business_id = b.id);

update public.locations loc
set is_default = true
where loc.id = (
  select l.id from public.locations l
  where l.business_id = loc.business_id and l.is_active
  order by l.is_default desc, l.created_at
  limit 1
)
and not exists (
  select 1 from public.locations d
  where d.business_id = loc.business_id and d.is_default
);

insert into public.product_stock (business_id, product_id, location_id, quantity)
select p.business_id, p.id, l.id, p.stock
from public.products p
join public.locations l on l.business_id = p.business_id and l.is_default
where not exists (select 1 from public.product_stock ps where ps.product_id = p.id);

create or replace function public.create_business_with_owner(
  _name text,
  _business_type public.business_type,
  _currency text,
  _phone text,
  _address text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_business_id uuid;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'You must be signed in to create a business.' using errcode = 'B0002';
  end if;

  if exists (select 1 from public.businesses where lower(trim(name)) = lower(trim(_name))) then
    raise exception 'That business name is already taken. Please choose another.' using errcode = 'B0001';
  end if;

  insert into public.businesses (
    name, business_type, currency, phone, address, created_by, onboarding_completed
  )
  values (
    _name, _business_type, _currency, nullif(_phone, ''), nullif(_address, ''), v_user_id, true
  )
  returning id into v_business_id;

  insert into public.business_members (business_id, user_id, role, staff_name)
  values (
    v_business_id, v_user_id, 'owner',
    (select raw_user_meta_data->>'full_name' from auth.users where id = v_user_id)
  );

  insert into public.business_settings (business_id) values (v_business_id);

  insert into public.locations (business_id, name, is_default, is_active)
  values (v_business_id, 'Main', true, true);

  insert into public.subscriptions (
    business_id, plan, status, trial_ends_at, current_period_start, current_period_end
  )
  values (
    v_business_id, 'pro', 'trialing', now() + interval '3 days', now(), now() + interval '3 days'
  );

  return v_business_id;
end;
$$;

drop function if exists public.create_product(uuid, text, text, text, text, numeric, numeric, numeric, numeric, numeric, text, uuid);

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
  _location_id uuid default null
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
    business_id, name, sku, barcode, unit, cost_price, selling_price, stock, min_stock, tax_rate, description, supplier_id
  ) values (
    _business_id, _name, nullif(_sku, ''), nullif(_barcode, ''), coalesce(nullif(_unit, ''), 'unit'),
    _cost_price, _selling_price, 0, _min_stock, _tax_rate, nullif(_description, ''), _supplier_id
  ) returning products.id into _product_id;

  if _stock > 0 then
    perform public.apply_stock_delta(_business_id, _product_id, _resolved_location, _stock);
    insert into public.inventory_movements (
      business_id, product_id, location_id, movement_type, quantity, stock_before, stock_after, reason, created_by
    ) values (
      _business_id, _product_id, _resolved_location, 'stock_in', _stock, 0, _stock, 'Opening stock', auth.uid()
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

drop function if exists public.adjust_stock(uuid, uuid, public.movement_type, numeric, text);

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

drop function if exists public.create_sale(uuid, uuid, numeric, public.payment_method, text, jsonb, text);

create or replace function public.create_sale(
  _business_id uuid,
  _customer_id uuid,
  _discount numeric,
  _payment_method public.payment_method,
  _notes text,
  _items jsonb,
  _idempotency_key text default null,
  _location_id uuid default null
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
  _resolved_location uuid;
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

  _resolved_location := public.resolve_location_id(_business_id, _location_id);
  select allow_negative_stock into _allow_negative from public.business_settings where business_id = _business_id;

  insert into public.business_counters (business_id) values (_business_id)
    on conflict (business_id) do nothing;
  update public.business_counters set sale_seq = sale_seq + 1
    where business_id = _business_id returning sale_seq into _seq;
  _number := 'S-' || lpad(_seq::text, 4, '0');

  insert into public.sales (business_id, sale_number, customer_id, payment_method, status, notes, created_by, idempotency_key, location_id)
  values (_business_id, _number, _customer_id, _payment_method, 'completed', nullif(trim(_notes), ''), auth.uid(), _idempotency_key, _resolved_location)
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

    _stock_before := public.get_location_stock(_product.id, _resolved_location);
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

    perform public.apply_stock_delta(_business_id, _product.id, _resolved_location, -_qty);
    insert into public.inventory_movements (
      business_id, product_id, location_id, movement_type, quantity, stock_before, stock_after, reference_type, reference_id, created_by
    ) values (
      _business_id, _product.id, _resolved_location, 'sale', -_qty, _stock_before, _stock_after, 'sale', _sale_id, auth.uid()
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

create or replace function public.create_location(
  _business_id uuid,
  _name text,
  _address text,
  _phone text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _id uuid;
begin
  if not public.has_business_role(_business_id, array['owner','admin']::public.app_role[]) then
    raise exception 'Your role does not allow this action.' using errcode = 'B0002';
  end if;
  if _name is null or length(trim(_name)) = 0 then
    raise exception 'Location name is required.' using errcode = 'B0001';
  end if;

  insert into public.locations (business_id, name, address, phone)
  values (_business_id, trim(_name), nullif(trim(_address), ''), nullif(trim(_phone), ''))
  returning id into _id;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary)
  values (_business_id, auth.uid(), 'location.created', 'location', _id, 'Added location ' || trim(_name));

  return _id;
end;
$$;

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
      'team.permission_changed', 'purchase_order.status_changed', 'sale.refunded',
      'recurring_invoice.created', 'team.commission_rate_set',
      'storefront.saved', 'storefront.published', 'storefront.unpublished',
      'storefront.marketplace',
      'store_order.created', 'store_order.updated', 'store_order.paid', 'store_order.cancelled',
      'store_complaint.created', 'store_review.created', 'store_listing_report.created',
      'location.created', 'location.updated', 'location.deactivated'
    )
  );

revoke all on function public.resolve_location_id(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_location_stock(uuid, uuid) from public, anon, authenticated;
revoke all on function public.apply_stock_delta(uuid, uuid, uuid, numeric) from public, anon, authenticated;
revoke all on function public.sync_default_location_stock() from public, anon, authenticated;
revoke all on function public.create_business_with_owner(text, public.business_type, text, text, text) from public, anon;
revoke all on function public.create_product(uuid, text, text, text, text, numeric, numeric, numeric, numeric, numeric, text, uuid, uuid) from public, anon;
revoke all on function public.adjust_stock(uuid, uuid, public.movement_type, numeric, text, uuid) from public, anon;
revoke all on function public.create_sale(uuid, uuid, numeric, public.payment_method, text, jsonb, text, uuid) from public, anon;
revoke all on function public.create_location(uuid, text, text, text) from public, anon;

grant execute on function public.create_business_with_owner(text, public.business_type, text, text, text) to authenticated;
grant execute on function public.create_product(uuid, text, text, text, text, numeric, numeric, numeric, numeric, numeric, text, uuid, uuid) to authenticated;
grant execute on function public.adjust_stock(uuid, uuid, public.movement_type, numeric, text, uuid) to authenticated;
grant execute on function public.create_sale(uuid, uuid, numeric, public.payment_method, text, jsonb, text, uuid) to authenticated;
grant execute on function public.create_location(uuid, text, text, text) to authenticated;
