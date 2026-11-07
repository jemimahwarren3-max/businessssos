alter table public.sales
  add column if not exists is_historical boolean not null default false,
  add column if not exists import_batch_key text,
  add column if not exists source_row_number integer;
alter table public.sales drop constraint if exists sales_import_identity_check;
alter table public.sales
  add constraint sales_import_identity_check check (
    (import_batch_key is null and source_row_number is null)
    or (
      import_batch_key is not null
      and source_row_number is not null
      and import_batch_key ~ '^[0-9a-f]{64}$'
      and source_row_number >= 2
    )
  );
create unique index if not exists sales_import_row_uniq
  on public.sales (business_id, import_batch_key, source_row_number)
  where import_batch_key is not null;

alter table public.sale_items
  add column if not exists is_historical boolean not null default false;
alter table public.payments
  add column if not exists is_historical boolean not null default false;
alter table public.expenses
  add column if not exists is_historical boolean not null default false,
  add column if not exists import_batch_key text,
  add column if not exists source_row_number integer;
alter table public.expenses drop constraint if exists expenses_import_identity_check;
alter table public.expenses
  add constraint expenses_import_identity_check check (
    (import_batch_key is null and source_row_number is null)
    or (
      import_batch_key is not null
      and source_row_number is not null
      and import_batch_key ~ '^[0-9a-f]{64}$'
      and source_row_number >= 2
    )
  );
create unique index if not exists expenses_import_row_uniq
  on public.expenses (business_id, import_batch_key, source_row_number)
  where import_batch_key is not null;

update public.sales
set is_historical = true
where sale_number like 'HIST-%' or sale_number like 'IMP-%';

update public.sale_items i
set is_historical = true
from public.sales s
where s.id = i.sale_id and s.is_historical;

update public.payments p
set is_historical = true
from public.sales s
where s.id = p.sale_id and s.is_historical;

drop function if exists public.import_sale_history_row(uuid, timestamptz, numeric, numeric, text);
create function public.import_historical_sale_total(
  _business_id uuid,
  _sale_date timestamptz,
  _total numeric,
  _cost numeric,
  _description text,
  _import_batch_key text,
  _source_row_number integer
) returns table(sale_id uuid, imported boolean)
language plpgsql security definer set search_path = public as $$
declare
  _seq int;
  _number text;
  _sale_id uuid;
  _cost_capped numeric(14,2);
begin
  if not public.has_permission(_business_id, 'sales.import') then
    raise exception 'You do not have permission to import sales.' using errcode = 'B0002';
  end if;
  if _total is null or _total <= 0 then
    raise exception 'Total must be greater than zero.' using errcode = 'B0001';
  end if;
  if _sale_date is null then
    raise exception 'Sale date is required.' using errcode = 'B0001';
  end if;
  if _import_batch_key is null
     or _import_batch_key !~ '^[0-9a-f]{64}$'
     or _source_row_number is null
     or _source_row_number < 2 then
    raise exception 'A valid import identity is required.' using errcode = 'B0001';
  end if;

  select id into _sale_id from public.sales
  where business_id = _business_id
    and import_batch_key = _import_batch_key
    and source_row_number = _source_row_number;
  if found then
    return query select _sale_id, false;
    return;
  end if;

  insert into public.business_counters (business_id) values (_business_id)
    on conflict (business_id) do nothing;
  update public.business_counters set sale_seq = sale_seq + 1
    where business_id = _business_id returning sale_seq into _seq;
  _number := 'HIST-' || lpad(_seq::text, 4, '0');
  _cost_capped := least(greatest(coalesce(_cost, 0), 0), _total);

  insert into public.sales (
    business_id, sale_number, subtotal, tax, discount, total, cost_total, amount_paid,
    payment_method, status, notes, created_by, created_at, is_historical,
    import_batch_key, source_row_number
  ) values (
    _business_id, _number, _total, 0, 0, _total, _cost_capped, _total,
    'cash', 'completed', coalesce(nullif(trim(_description), ''), 'Imported from spreadsheet'),
    auth.uid(), _sale_date, true, _import_batch_key, _source_row_number
  )
  on conflict (business_id, import_batch_key, source_row_number)
    where import_batch_key is not null
    do nothing
  returning id into _sale_id;

  if _sale_id is null then
    select id into _sale_id from public.sales
    where business_id = _business_id
      and import_batch_key = _import_batch_key
      and source_row_number = _source_row_number;
    return query select _sale_id, false;
    return;
  end if;
  return query select _sale_id, true;
end;
$$;
revoke all on function public.import_historical_sale_total(uuid, timestamptz, numeric, numeric, text, text, integer) from public, anon;
grant execute on function public.import_historical_sale_total(uuid, timestamptz, numeric, numeric, text, text, integer) to authenticated;

drop function if exists public.import_sale_line(uuid, timestamptz, uuid, numeric, numeric, uuid, public.payment_method, text);
create function public.import_historical_sale_line(
  _business_id uuid,
  _sale_date timestamptz,
  _product_id uuid,
  _quantity numeric,
  _unit_price numeric,
  _customer_id uuid,
  _payment_method public.payment_method,
  _notes text,
  _import_batch_key text,
  _source_row_number integer
) returns table(sale_id uuid, imported boolean)
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
begin
  if not public.has_permission(_business_id, 'sales.import') then
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
  if _import_batch_key is null
     or _import_batch_key !~ '^[0-9a-f]{64}$'
     or _source_row_number is null
     or _source_row_number < 2 then
    raise exception 'A valid import identity is required.' using errcode = 'B0001';
  end if;

  select id into _sale_id from public.sales
  where business_id = _business_id
    and import_batch_key = _import_batch_key
    and source_row_number = _source_row_number;
  if found then
    return query select _sale_id, false;
    return;
  end if;

  if _customer_id is not null and not exists (
    select 1 from public.customers
    where id = _customer_id and business_id = _business_id and deleted_at is null
  ) then
    raise exception 'That customer could not be found.' using errcode = 'B0001';
  end if;

  select * into _product from public.products
  where id = _product_id and business_id = _business_id and deleted_at is null;
  if not found then
    raise exception 'That product could not be found.' using errcode = 'B0001';
  end if;

  _price := coalesce(_unit_price, _product.selling_price);
  if _price < 0 then
    raise exception 'Item price cannot be negative.' using errcode = 'B0001';
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
    amount_paid, payment_method, status, notes, created_by, created_at, is_historical,
    import_batch_key, source_row_number
  ) values (
    _business_id, _number, _customer_id, _line_subtotal, _line_tax, 0, _line_total,
    round(_quantity * _product.cost_price, 2),
    case when _payment_method = 'credit' then 0 else _line_total end,
    _payment_method, 'completed', coalesce(nullif(trim(_notes), ''), 'Imported from spreadsheet'),
    auth.uid(), _sale_date, true, _import_batch_key, _source_row_number
  )
  on conflict (business_id, import_batch_key, source_row_number)
    where import_batch_key is not null
    do nothing
  returning id into _sale_id;

  if _sale_id is null then
    select id into _sale_id from public.sales
    where business_id = _business_id
      and import_batch_key = _import_batch_key
      and source_row_number = _source_row_number;
    return query select _sale_id, false;
    return;
  end if;

  insert into public.sale_items (
    business_id, sale_id, product_id, name, sku, quantity, unit_price, cost_price,
    discount, tax, line_total, created_at, is_historical
  ) values (
    _business_id, _sale_id, _product.id, _product.name, _product.sku, _quantity, _price,
    _product.cost_price, 0, _line_tax, _line_total, _sale_date, true
  );

  if _payment_method <> 'credit' then
    insert into public.payments (
      business_id, customer_id, sale_id, amount, method, created_by, paid_at, created_at, is_historical
    ) values (
      _business_id, _customer_id, _sale_id, _line_total, _payment_method, auth.uid(),
      _sale_date, _sale_date, true
    );
  end if;

  return query select _sale_id, true;
end;
$$;
revoke all on function public.import_historical_sale_line(uuid, timestamptz, uuid, numeric, numeric, uuid, public.payment_method, text, text, integer) from public, anon;
grant execute on function public.import_historical_sale_line(uuid, timestamptz, uuid, numeric, numeric, uuid, public.payment_method, text, text, integer) to authenticated;

create or replace function public.import_historical_expense(
  _business_id uuid,
  _expense_date date,
  _category text,
  _description text,
  _amount numeric,
  _vendor text,
  _import_batch_key text,
  _source_row_number integer
) returns table(expense_id uuid, imported boolean)
language plpgsql security definer set search_path = public as $$
declare
  _expense_id uuid;
begin
  if not public.has_permission(_business_id, 'expenses.import') then
    raise exception 'You do not have permission to import expenses.' using errcode = 'B0002';
  end if;
  if _expense_date is null or _amount is null or _amount <= 0 then
    raise exception 'A valid date and positive amount are required.' using errcode = 'B0001';
  end if;
  if _category not in ('rent', 'utilities', 'transport', 'salaries', 'marketing', 'supplies', 'maintenance', 'other') then
    raise exception 'Choose a valid expense category.' using errcode = 'B0001';
  end if;
  if _import_batch_key is null
     or _import_batch_key !~ '^[0-9a-f]{64}$'
     or _source_row_number is null
     or _source_row_number < 2 then
    raise exception 'A valid import identity is required.' using errcode = 'B0001';
  end if;

  insert into public.expenses (
    business_id, category, description, amount, expense_date, vendor, created_by,
    is_historical, import_batch_key, source_row_number
  ) values (
    _business_id, _category, nullif(trim(_description), ''), _amount, _expense_date,
    nullif(trim(_vendor), ''), auth.uid(), true, _import_batch_key, _source_row_number
  )
  on conflict (business_id, import_batch_key, source_row_number)
    where import_batch_key is not null
    do nothing
  returning id into _expense_id;

  if _expense_id is null then
    select id into _expense_id from public.expenses
    where business_id = _business_id
      and import_batch_key = _import_batch_key
      and source_row_number = _source_row_number;
    return query select _expense_id, false;
    return;
  end if;
  return query select _expense_id, true;
end;
$$;
revoke all on function public.import_historical_expense(uuid, date, text, text, numeric, text, text, integer) from public, anon;
grant execute on function public.import_historical_expense(uuid, date, text, text, numeric, text, text, integer) to authenticated;

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
          and p.is_historical = false
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
        and s.is_historical = false
        and coalesce(s.amount_paid, 0) < s.total
    ), 0)
  );
end;
$$;
revoke all on function public.get_daily_takings(uuid, date) from public, anon;
grant execute on function public.get_daily_takings(uuid, date) to authenticated;

create or replace function public.notify_low_stock()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('businessos.suppress_import_notifications', true) = 'true' then
    return new;
  end if;
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

create or replace function public.import_product_row(
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
begin
  if not public.has_permission(_business_id, 'inventory.import') then
    raise exception 'You do not have permission to import products.' using errcode = 'B0002';
  end if;
  perform set_config('businessos.suppress_import_notifications', 'true', true);
  return query
    select p.id, p.name, p.stock
    from public.create_product(
      _business_id, _name, _sku, _barcode, _unit, _cost_price, _selling_price,
      _stock, _min_stock, _tax_rate, _description, _supplier_id, _location_id, null
    ) p;
end;
$$;
revoke all on function public.import_product_row(uuid, text, text, text, text, numeric, numeric, numeric, numeric, numeric, text, uuid, uuid) from public, anon;
grant execute on function public.import_product_row(uuid, text, text, text, text, numeric, numeric, numeric, numeric, numeric, text, uuid, uuid) to authenticated;