-- Close C1/H4 lockout and rate-limit RPCs, H1 owner minting, H2 direct sales
-- inserts, H3 POS catalogue prices, and C2 grant leaks if staging skipped
-- the receipts migration.

-- C1 / H4: anon must not record, peek, or clear lockouts, or tick public buckets.
revoke all on function public.clear_login_failures(text) from public, anon, authenticated;
revoke all on function public.record_login_failure(text, int) from public, anon, authenticated;
revoke all on function public.peek_login_failures(text, int) from public, anon, authenticated;
revoke all on function public.check_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.clear_login_failures(text) to service_role;
grant execute on function public.record_login_failure(text, int) to service_role;
grant execute on function public.peek_login_failures(text, int) to service_role;
grant execute on function public.check_rate_limit(text, int, int) to service_role;

create or replace function public.clear_login_failures(_key text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Not allowed.' using errcode = 'B0002';
  end if;
  delete from public.rate_limit_hits where key = _key;
end;
$$;

create or replace function public.record_login_failure(_key text, _window_seconds int)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_window_start timestamptz;
  v_count int;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Not allowed.' using errcode = 'B0002';
  end if;
  v_window_start := to_timestamp(floor(extract(epoch from now()) / _window_seconds) * _window_seconds);
  insert into public.rate_limit_hits (key, window_start, count)
  values (_key, v_window_start, 1)
  on conflict (key, window_start) do update set count = rate_limit_hits.count + 1
  returning count into v_count;
  delete from public.rate_limit_hits where window_start < now() - interval '25 hours';
  return v_count;
end;
$$;

create or replace function public.peek_login_failures(_key text, _window_seconds int)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_window_start timestamptz;
  v_count int;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Not allowed.' using errcode = 'B0002';
  end if;
  v_window_start := to_timestamp(floor(extract(epoch from now()) / _window_seconds) * _window_seconds);
  select count into v_count from public.rate_limit_hits
    where key = _key and window_start = v_window_start;
  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.clear_login_failures(text) from public, anon, authenticated;
revoke all on function public.record_login_failure(text, int) from public, anon, authenticated;
revoke all on function public.peek_login_failures(text, int) from public, anon, authenticated;
grant execute on function public.clear_login_failures(text) to service_role;
grant execute on function public.record_login_failure(text, int) to service_role;
grant execute on function public.peek_login_failures(text, int) to service_role;

-- C2 belt: paid-sale helpers stay service_role even if an older migration only
-- revoked from public.
revoke all on function public.storefront_record_sale(uuid) from public, anon, authenticated;
revoke all on function public.storefront_restore_stock(uuid) from public, anon, authenticated;
grant execute on function public.storefront_record_sale(uuid) to service_role;
grant execute on function public.storefront_restore_stock(uuid) to service_role;

-- H1: only an owner can grant owner. Invites and staff adds cannot mint owner.
create or replace function public.create_business_invite(_business_id uuid, _role public.app_role)
returns text
language plpgsql security definer set search_path = public as $$
declare
  _token text;
begin
  if not public.has_business_role(_business_id, array['owner','admin']::public.app_role[]) then
    raise exception 'You do not have permission to invite team members.' using errcode = 'B0002';
  end if;
  if _role = 'owner' then
    raise exception 'You cannot invite someone as owner.' using errcode = 'B0002';
  end if;
  _token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.business_invites (business_id, role, token, created_by, expires_at)
  values (_business_id, _role, _token, auth.uid(), now() + interval '7 days');
  return _token;
end;
$$;
revoke all on function public.create_business_invite(uuid, public.app_role) from public, anon;
grant execute on function public.create_business_invite(uuid, public.app_role) to authenticated;

create or replace function public.update_team_member_role(
  _business_id uuid, _member_user_id uuid, _role public.app_role
) returns void
language plpgsql security definer set search_path = public as $$
declare
  _owner_count int;
  _current_role public.app_role;
  _caller_is_owner boolean;
begin
  if not public.has_business_role(_business_id, array['owner','admin']::public.app_role[]) then
    raise exception 'You do not have permission to change roles.' using errcode = 'B0002';
  end if;
  _caller_is_owner := public.has_business_role(_business_id, array['owner']::public.app_role[]);
  if _role = 'owner' and not _caller_is_owner then
    raise exception 'Only an owner can grant the owner role.' using errcode = 'B0002';
  end if;
  select role into _current_role from public.business_members
    where business_id = _business_id and user_id = _member_user_id and is_active;
  if not found then
    raise exception 'That team member could not be found.' using errcode = 'B0001';
  end if;
  if _current_role = 'owner' and not _caller_is_owner then
    raise exception 'Only an owner can change another owner.' using errcode = 'B0002';
  end if;
  if _current_role = 'owner' and _role <> 'owner' then
    select count(*) into _owner_count from public.business_members
      where business_id = _business_id and role = 'owner' and is_active;
    if _owner_count <= 1 then
      raise exception 'A business must have at least one owner.' using errcode = 'B0001';
    end if;
  end if;
  update public.business_members set role = _role
    where business_id = _business_id and user_id = _member_user_id;
end;
$$;
revoke all on function public.update_team_member_role(uuid, uuid, public.app_role) from public, anon;
grant execute on function public.update_team_member_role(uuid, uuid, public.app_role) to authenticated;

drop policy if exists "admins update member" on public.business_members;
create policy "admins update member" on public.business_members for update to authenticated
  using (
    public.has_business_role(business_id, array['owner']::public.app_role[])
    or (
      public.has_business_role(business_id, array['admin']::public.app_role[])
      and role <> 'owner'
    )
  )
  with check (
    public.has_business_role(business_id, array['owner']::public.app_role[])
    or (
      public.has_business_role(business_id, array['admin']::public.app_role[])
      and role <> 'owner'
    )
  );

drop policy if exists "bootstrap or admin add member" on public.business_members;
create policy "bootstrap or admin add member" on public.business_members for insert to authenticated
  with check (
    (
      public.has_business_role(business_id, array['owner','admin']::public.app_role[])
      and role <> 'owner'
    )
    or (
      user_id = auth.uid()
      and role = 'owner'
      and exists (
        select 1 from public.businesses b
        where b.id = business_id and b.created_by = auth.uid()
      )
    )
  );

-- H2: books writes go through SECURITY DEFINER RPCs, not PostgREST inserts.
drop policy if exists "team create sales" on public.sales;
drop policy if exists "staff update sales" on public.sales;
drop policy if exists "admins delete sales" on public.sales;
drop policy if exists "team create sale items" on public.sale_items;
drop policy if exists "finance record payments" on public.payments;
drop policy if exists "admins adjust payments" on public.payments;

-- H3: POS uses catalogue selling_price and sales.create, not client unitPrice.
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
  if not public.has_permission(_business_id, 'sales.create') then
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

    _price := _product.selling_price;
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

  if _discount > _subtotal then
    raise exception 'Discount cannot be more than the items total.' using errcode = 'B0001';
  end if;

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
revoke all on function public.create_sale(uuid, uuid, numeric, public.payment_method, text, jsonb, text, uuid) from public, anon;
grant execute on function public.create_sale(uuid, uuid, numeric, public.payment_method, text, jsonb, text, uuid) to authenticated;
