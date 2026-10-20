-- POS cash drawer: one open session per business, a signed movement ledger,
-- and cash sales/refunds that refuse to post without an open till.

create table if not exists public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  opened_by uuid not null references auth.users(id),
  opened_at timestamptz not null default now(),
  opening_float numeric(14,2) not null check (opening_float >= 0),
  closed_by uuid references auth.users(id),
  closed_at timestamptz,
  counted_cash numeric(14,2),
  expected_cash numeric(14,2),
  discrepancy numeric(14,2),
  note text,
  constraint cash_sessions_closed_complete check (
    (closed_at is null and counted_cash is null and expected_cash is null and discrepancy is null and closed_by is null)
    or (closed_at is not null and counted_cash is not null and expected_cash is not null and discrepancy is not null and closed_by is not null)
  )
);
create index if not exists cash_sessions_business_idx on public.cash_sessions (business_id, opened_at desc);
create unique index if not exists cash_sessions_one_open_per_business
  on public.cash_sessions (business_id) where closed_at is null;

create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  session_id uuid not null references public.cash_sessions(id) on delete cascade,
  kind text not null check (kind in ('open_float', 'cash_sale', 'cash_refund', 'pay_in', 'pay_out')),
  amount numeric(14,2) not null,
  reference_type text,
  reference_id uuid,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint cash_movements_amount_sign check (
    (kind in ('open_float', 'cash_sale', 'pay_in') and amount >= 0)
    or (kind in ('cash_refund', 'pay_out') and amount <= 0)
  )
);
create index if not exists cash_movements_session_idx on public.cash_movements (session_id, created_at);

alter table public.sales
  add column if not exists cash_session_id uuid references public.cash_sessions(id) on delete set null;

alter table public.cash_sessions enable row level security;
alter table public.cash_movements enable row level security;

revoke all on public.cash_sessions from anon, authenticated;
revoke all on public.cash_movements from anon, authenticated;
grant select on public.cash_sessions to authenticated;
grant select on public.cash_movements to authenticated;
grant all on public.cash_sessions to service_role;
grant all on public.cash_movements to service_role;

drop policy if exists "members read cash sessions" on public.cash_sessions;
create policy "members read cash sessions" on public.cash_sessions
  for select to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "members read cash movements" on public.cash_movements;
create policy "members read cash movements" on public.cash_movements
  for select to authenticated
  using (public.is_business_member(business_id));

create or replace function public.cash_open_session_id(_business_id uuid)
returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.cash_sessions
  where business_id = _business_id and closed_at is null
  limit 1;
$$;

create or replace function public.cash_post_movement(
  _business_id uuid,
  _kind text,
  _amount numeric,
  _reference_type text,
  _reference_id uuid,
  _note text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _session uuid;
  _id uuid;
  _signed numeric(14,2);
begin
  _session := public.cash_open_session_id(_business_id);
  if _session is null then
    raise exception 'Open the cash drawer before taking or refunding cash.' using errcode = 'B0001';
  end if;
  _signed := case
    when _kind in ('cash_refund', 'pay_out') then -abs(_amount)
    else abs(_amount)
  end;
  insert into public.cash_movements (
    business_id, session_id, kind, amount, reference_type, reference_id, note, created_by
  ) values (
    _business_id, _session, _kind, _signed, _reference_type, _reference_id, nullif(trim(coalesce(_note, '')), ''), auth.uid()
  ) returning id into _id;
  return _id;
end;
$$;

create or replace function public.open_cash_session(
  _business_id uuid,
  _opening_float numeric,
  _note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _id uuid;
begin
  if not public.has_business_role(_business_id, array['owner','admin','manager','cashier']::public.app_role[]) then
    raise exception 'Your role does not allow this action.' using errcode = 'B0002';
  end if;
  if _opening_float is null or _opening_float < 0 then
    raise exception 'Opening float cannot be negative.' using errcode = 'B0001';
  end if;
  if public.cash_open_session_id(_business_id) is not null then
    raise exception 'A cash drawer is already open.' using errcode = 'B0001';
  end if;

  insert into public.cash_sessions (business_id, opened_by, opening_float, note)
  values (_business_id, auth.uid(), round(_opening_float, 2), nullif(trim(coalesce(_note, '')), ''))
  returning id into _id;

  insert into public.cash_movements (
    business_id, session_id, kind, amount, note, created_by
  ) values (
    _business_id, _id, 'open_float', round(_opening_float, 2), 'Opening float', auth.uid()
  );

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary, new_values)
  values (
    _business_id, auth.uid(), 'cash_session.opened', 'cash_session', _id,
    'Opened cash drawer with float ' || round(_opening_float, 2),
    jsonb_build_object('opening_float', round(_opening_float, 2))
  );
  return _id;
end;
$$;

create or replace function public.close_cash_session(
  _business_id uuid,
  _counted_cash numeric,
  _note text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _session public.cash_sessions;
  _expected numeric(14,2);
begin
  if not public.has_business_role(_business_id, array['owner','admin','manager','cashier']::public.app_role[]) then
    raise exception 'Your role does not allow this action.' using errcode = 'B0002';
  end if;
  if _counted_cash is null or _counted_cash < 0 then
    raise exception 'Counted cash cannot be negative.' using errcode = 'B0001';
  end if;

  select * into _session from public.cash_sessions
    where business_id = _business_id and closed_at is null
    for update;
  if not found then
    raise exception 'No cash drawer is open.' using errcode = 'B0001';
  end if;

  select coalesce(sum(amount), 0) into _expected
    from public.cash_movements where session_id = _session.id;

  update public.cash_sessions set
    closed_at = now(),
    closed_by = auth.uid(),
    counted_cash = round(_counted_cash, 2),
    expected_cash = _expected,
    discrepancy = round(_counted_cash, 2) - _expected,
    note = coalesce(nullif(trim(coalesce(_note, '')), ''), note)
  where id = _session.id;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary, new_values)
  values (
    _business_id, auth.uid(), 'cash_session.closed', 'cash_session', _session.id,
    'Closed cash drawer. Counted ' || round(_counted_cash, 2) || ', expected ' || _expected,
    jsonb_build_object(
      'counted', round(_counted_cash, 2),
      'expected', _expected,
      'discrepancy', round(_counted_cash, 2) - _expected
    )
  );

  return jsonb_build_object(
    'sessionId', _session.id,
    'expected', _expected,
    'counted', round(_counted_cash, 2),
    'discrepancy', round(_counted_cash, 2) - _expected
  );
end;
$$;

create or replace function public.add_cash_movement(
  _business_id uuid,
  _kind text,
  _amount numeric,
  _note text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _id uuid;
begin
  if _kind not in ('pay_in', 'pay_out') then
    raise exception 'Only pay in or pay out can be recorded here.' using errcode = 'B0001';
  end if;
  if _kind = 'pay_out' then
    if not public.has_business_role(_business_id, array['owner','admin','manager']::public.app_role[]) then
      raise exception 'Your role does not allow this action.' using errcode = 'B0002';
    end if;
  elsif not public.has_business_role(_business_id, array['owner','admin','manager','cashier']::public.app_role[]) then
    raise exception 'Your role does not allow this action.' using errcode = 'B0002';
  end if;
  if _amount is null or _amount <= 0 then
    raise exception 'Amount must be greater than zero.' using errcode = 'B0001';
  end if;
  if _note is null or length(trim(_note)) < 2 then
    raise exception 'Enter a reason for this cash movement.' using errcode = 'B0001';
  end if;
  _id := public.cash_post_movement(_business_id, _kind, _amount, null, null, _note);
  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary)
  values (
    _business_id, auth.uid(),
    case when _kind = 'pay_in' then 'cash.pay_in' else 'cash.pay_out' end,
    'cash_session', public.cash_open_session_id(_business_id),
    case when _kind = 'pay_in' then 'Cash in ' else 'Cash out ' end || round(_amount, 2)
  );
  return _id;
end;
$$;

create or replace function public.get_cash_drawer(_business_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _session public.cash_sessions;
  _expected numeric(14,2);
  _movements jsonb;
begin
  if not public.is_business_member(_business_id) then
    raise exception 'You are not a member of this business.' using errcode = 'B0002';
  end if;
  select * into _session from public.cash_sessions
    where business_id = _business_id and closed_at is null;
  if not found then
    return jsonb_build_object('open', false, 'sessions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id,
        'openedAt', s.opened_at,
        'closedAt', s.closed_at,
        'openingFloat', s.opening_float,
        'expected', s.expected_cash,
        'counted', s.counted_cash,
        'discrepancy', s.discrepancy
      ) order by s.opened_at desc), '[]'::jsonb)
      from (
        select * from public.cash_sessions where business_id = _business_id order by opened_at desc limit 20
      ) s
    ));
  end if;
  select coalesce(sum(amount), 0) into _expected from public.cash_movements where session_id = _session.id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id,
    'kind', m.kind,
    'amount', m.amount,
    'note', m.note,
    'createdAt', m.created_at
  ) order by m.created_at), '[]'::jsonb) into _movements
  from public.cash_movements m where m.session_id = _session.id;

  return jsonb_build_object(
    'open', true,
    'sessionId', _session.id,
    'openedAt', _session.opened_at,
    'openingFloat', _session.opening_float,
    'note', _session.note,
    'expected', _expected,
    'movements', _movements,
    'sessions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id,
        'openedAt', s.opened_at,
        'closedAt', s.closed_at,
        'openingFloat', s.opening_float,
        'expected', s.expected_cash,
        'counted', s.counted_cash,
        'discrepancy', s.discrepancy
      ) order by s.opened_at desc), '[]'::jsonb)
      from (
        select * from public.cash_sessions where business_id = _business_id order by opened_at desc limit 20
      ) s
    )
  );
end;
$$;

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
  _cash_session uuid;
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

  if _payment_method = 'cash' then
    _cash_session := public.cash_open_session_id(_business_id);
    if _cash_session is null then
      raise exception 'Open the cash drawer before taking cash.' using errcode = 'B0001';
    end if;
  end if;

  _resolved_location := public.resolve_location_id(_business_id, _location_id);
  select allow_negative_stock into _allow_negative from public.business_settings where business_id = _business_id;

  insert into public.business_counters (business_id) values (_business_id)
    on conflict (business_id) do nothing;
  update public.business_counters set sale_seq = sale_seq + 1
    where business_id = _business_id returning sale_seq into _seq;
  _number := 'S-' || lpad(_seq::text, 4, '0');

  insert into public.sales (business_id, sale_number, customer_id, payment_method, status, notes, created_by, idempotency_key, location_id, cash_session_id)
  values (_business_id, _number, _customer_id, _payment_method, 'completed', nullif(trim(_notes), ''), auth.uid(), _idempotency_key, _resolved_location, _cash_session)
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

  if _payment_method = 'cash' then
    perform public.cash_post_movement(_business_id, 'cash_sale', _total, 'sale', _sale_id, _number);
  end if;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary, new_values)
  values (_business_id, auth.uid(), 'sale.created', 'sale', _sale_id,
    'Recorded sale ' || _number, jsonb_build_object('total', _total, 'payment_method', _payment_method));

  return _sale_id;
end;
$$;

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
  if _sale.payment_method = 'cash' and public.cash_open_session_id(_business_id) is null then
    raise exception 'Open the cash drawer before refunding cash.' using errcode = 'B0001';
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

  if _sale.payment_method = 'cash' then
    perform public.cash_post_movement(_business_id, 'cash_refund', _refund_total, 'sale_refund', _refund_id, _sale.sale_number);
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

insert into public.permissions (key, category, label) values
  ('cash.drawer', 'Sales', 'Open, close and view the cash drawer')
on conflict (key) do nothing;

insert into public.business_role_permissions (business_id, role, permission_key)
select distinct brp.business_id, d.role, 'cash.drawer'
from public.business_role_permissions brp
cross join (values
  ('admin'::public.app_role),
  ('manager'::public.app_role),
  ('cashier'::public.app_role)
) as d(role)
where not exists (
  select 1 from public.business_role_permissions x
  where x.business_id = brp.business_id and x.role = d.role and x.permission_key = 'cash.drawer'
);

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
    ('admin'::public.app_role, 'audit.view'),
    ('admin'::public.app_role, 'cash.drawer'), ('manager'::public.app_role, 'cash.drawer'), ('cashier'::public.app_role, 'cash.drawer')
  ) as d(role, permission_key);
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
      'location.created', 'location.updated', 'location.deactivated',
      'cash_session.opened', 'cash_session.closed', 'cash.pay_in', 'cash.pay_out'
    )
  );

revoke all on function public.cash_open_session_id(uuid) from public, anon, authenticated;
revoke all on function public.cash_post_movement(uuid, text, numeric, text, uuid, text) from public, anon, authenticated;
revoke all on function public.open_cash_session(uuid, numeric, text) from public, anon;
revoke all on function public.close_cash_session(uuid, numeric, text) from public, anon;
revoke all on function public.add_cash_movement(uuid, text, numeric, text) from public, anon;
revoke all on function public.get_cash_drawer(uuid) from public, anon;
revoke all on function public.create_sale(uuid, uuid, numeric, public.payment_method, text, jsonb, text, uuid) from public, anon;
revoke all on function public.refund_sale(uuid, uuid, jsonb, text) from public, anon;
revoke all on function public.seed_default_role_permissions(uuid) from public;

grant execute on function public.open_cash_session(uuid, numeric, text) to authenticated;
grant execute on function public.close_cash_session(uuid, numeric, text) to authenticated;
grant execute on function public.add_cash_movement(uuid, text, numeric, text) to authenticated;
grant execute on function public.get_cash_drawer(uuid) to authenticated;
grant execute on function public.create_sale(uuid, uuid, numeric, public.payment_method, text, jsonb, text, uuid) to authenticated;
grant execute on function public.refund_sale(uuid, uuid, jsonb, text) to authenticated;
