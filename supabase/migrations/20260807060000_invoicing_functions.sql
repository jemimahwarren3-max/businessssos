-- ============ business-scoped document numbering ============
create table public.business_counters (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  invoice_seq integer not null default 0,
  quote_seq integer not null default 0
);
grant select on public.business_counters to authenticated;
grant all on public.business_counters to service_role;
alter table public.business_counters enable row level security;
create policy "members read counters" on public.business_counters for select to authenticated
  using (public.is_business_member(business_id));

-- Custom SQLSTATEs whose message text is safe to show verbatim to the browser
-- (never a raw Postgres/RLS error): B0001 = validation, B0002 = authorization.

-- ============ invoices ============
create or replace function public.create_invoice(
  _business_id uuid,
  _customer_id uuid,
  _issue_date date,
  _due_date date,
  _notes text,
  _terms text,
  _discount numeric,
  _items jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _invoice_id uuid;
  _seq int;
  _prefix text;
  _number text;
  _subtotal numeric(14,2) := 0;
  _tax numeric(14,2) := 0;
  _total numeric(14,2);
  _item jsonb;
  _line_subtotal numeric(14,2);
  _line_tax numeric(14,2);
  _qty numeric(14,3);
  _price numeric(14,2);
begin
  if not public.has_business_role(_business_id, array['owner','admin','manager','accountant']::public.app_role[]) then
    raise exception 'You do not have permission to create invoices.' using errcode = 'B0002';
  end if;
  if _items is null or jsonb_array_length(_items) = 0 then
    raise exception 'An invoice needs at least one item.' using errcode = 'B0001';
  end if;
  if _discount is null or _discount < 0 then
    raise exception 'Discount cannot be negative.' using errcode = 'B0001';
  end if;
  if _customer_id is not null and not exists (
    select 1 from public.customers where id = _customer_id and business_id = _business_id and deleted_at is null
  ) then
    raise exception 'That customer could not be found.' using errcode = 'B0001';
  end if;

  insert into public.business_counters (business_id) values (_business_id)
    on conflict (business_id) do nothing;
  update public.business_counters set invoice_seq = invoice_seq + 1
    where business_id = _business_id returning invoice_seq into _seq;
  select invoice_prefix into _prefix from public.businesses where id = _business_id;
  _number := coalesce(_prefix, 'INV') || '-' || lpad(_seq::text, 4, '0');

  insert into public.invoices (
    business_id, invoice_number, customer_id, issue_date, due_date, notes, terms, discount, status, created_by
  ) values (
    _business_id, _number, _customer_id, coalesce(_issue_date, current_date), _due_date,
    nullif(trim(_notes), ''), nullif(trim(_terms), ''), _discount, 'draft', auth.uid()
  ) returning id into _invoice_id;

  for _item in select * from jsonb_array_elements(_items)
  loop
    _qty := (_item->>'quantity')::numeric;
    _price := (_item->>'unitPrice')::numeric;
    if _qty is null or _qty <= 0 then
      raise exception 'Item quantity must be greater than zero.' using errcode = 'B0001';
    end if;
    if _price is null or _price < 0 then
      raise exception 'Item price cannot be negative.' using errcode = 'B0001';
    end if;
    _line_subtotal := round(_qty * _price, 2);
    _line_tax := round(_line_subtotal * coalesce((_item->>'taxRate')::numeric, 0) / 100, 2);
    insert into public.invoice_items (
      business_id, invoice_id, product_id, name, quantity, unit_price, discount, tax, line_total
    ) values (
      _business_id, _invoice_id, nullif(_item->>'productId', '')::uuid,
      _item->>'name', _qty, _price, 0, _line_tax, _line_subtotal + _line_tax
    );
    _subtotal := _subtotal + _line_subtotal;
    _tax := _tax + _line_tax;
  end loop;

  _total := greatest(_subtotal - _discount + _tax, 0);
  update public.invoices set subtotal = _subtotal, tax = _tax, total = _total where id = _invoice_id;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary, new_values)
  values (_business_id, auth.uid(), 'invoice.created', 'invoice', _invoice_id,
    'Created invoice ' || _number, jsonb_build_object('total', _total, 'status', 'draft'));

  return _invoice_id;
end;
$$;
revoke all on function public.create_invoice(uuid,uuid,date,date,text,text,numeric,jsonb) from public;
grant execute on function public.create_invoice(uuid,uuid,date,date,text,text,numeric,jsonb) to authenticated;

create or replace function public.set_invoice_status(
  _business_id uuid, _invoice_id uuid, _status public.doc_status
) returns void
language plpgsql security definer set search_path = public as $$
declare
  _invoice public.invoices;
begin
  if not public.has_business_role(_business_id, array['owner','admin','manager','accountant']::public.app_role[]) then
    raise exception 'You do not have permission to update invoices.' using errcode = 'B0002';
  end if;
  if _status not in ('sent','cancelled') then
    raise exception 'That status change is not supported.' using errcode = 'B0001';
  end if;

  select * into _invoice from public.invoices where id = _invoice_id and business_id = _business_id for update;
  if not found then
    raise exception 'That invoice could not be found.' using errcode = 'B0001';
  end if;

  if _status = 'sent' then
    if _invoice.status <> 'draft' then
      raise exception 'Only draft invoices can be sent.' using errcode = 'B0001';
    end if;
    update public.invoices set status = 'sent' where id = _invoice_id;
    if _invoice.customer_id is not null then
      update public.customers set outstanding_balance = outstanding_balance + (_invoice.total - _invoice.amount_paid)
        where id = _invoice.customer_id;
    end if;
  elsif _status = 'cancelled' then
    if _invoice.status in ('paid','cancelled') then
      raise exception 'This invoice cannot be cancelled.' using errcode = 'B0001';
    end if;
    update public.invoices set status = 'cancelled' where id = _invoice_id;
    if _invoice.customer_id is not null and _invoice.status <> 'draft' then
      update public.customers set outstanding_balance = greatest(outstanding_balance - (_invoice.total - _invoice.amount_paid), 0)
        where id = _invoice.customer_id;
    end if;
  end if;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary, old_values, new_values)
  values (_business_id, auth.uid(), 'invoice.status_changed', 'invoice', _invoice_id,
    'Invoice ' || _invoice.invoice_number || ' marked ' || _status,
    jsonb_build_object('status', _invoice.status), jsonb_build_object('status', _status));
end;
$$;
revoke all on function public.set_invoice_status(uuid,uuid,public.doc_status) from public;
grant execute on function public.set_invoice_status(uuid,uuid,public.doc_status) to authenticated;

create or replace function public.record_invoice_payment(
  _business_id uuid,
  _invoice_id uuid,
  _amount numeric,
  _method public.payment_method,
  _reference text,
  _idempotency_key text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _payment_id uuid;
  _invoice public.invoices;
  _new_paid numeric(14,2);
  _new_status public.doc_status;
begin
  if not public.has_business_role(_business_id, array['owner','admin','manager','cashier','accountant']::public.app_role[]) then
    raise exception 'You do not have permission to record payments.' using errcode = 'B0002';
  end if;
  if _amount is null or _amount <= 0 then
    raise exception 'Payment amount must be greater than zero.' using errcode = 'B0001';
  end if;

  if _idempotency_key is not null then
    select id into _payment_id from public.payments
      where business_id = _business_id and idempotency_key = _idempotency_key limit 1;
    if found then
      return _payment_id;
    end if;
  end if;

  select * into _invoice from public.invoices where id = _invoice_id and business_id = _business_id for update;
  if not found then
    raise exception 'That invoice could not be found.' using errcode = 'B0001';
  end if;
  if _invoice.status = 'cancelled' then
    raise exception 'You cannot record a payment on a cancelled invoice.' using errcode = 'B0001';
  end if;
  if _invoice.status = 'draft' then
    raise exception 'Send the invoice before recording a payment.' using errcode = 'B0001';
  end if;

  insert into public.payments (
    business_id, customer_id, invoice_id, amount, method, reference, idempotency_key, created_by
  ) values (
    _business_id, _invoice.customer_id, _invoice_id, _amount, _method, nullif(trim(_reference), ''),
    _idempotency_key, auth.uid()
  ) returning id into _payment_id;

  _new_paid := _invoice.amount_paid + _amount;
  _new_status := case
    when _new_paid >= _invoice.total then 'paid'
    else 'partially_paid'
  end;

  update public.invoices set amount_paid = _new_paid, status = _new_status where id = _invoice_id;

  if _invoice.customer_id is not null then
    update public.customers
      set outstanding_balance = greatest(outstanding_balance - _amount, 0)
      where id = _invoice.customer_id;
  end if;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary, new_values)
  values (_business_id, auth.uid(), 'payment.recorded', 'invoice', _invoice_id,
    'Recorded payment of ' || _amount || ' on invoice ' || _invoice.invoice_number,
    jsonb_build_object('amount', _amount, 'method', _method));

  return _payment_id;
end;
$$;
revoke all on function public.record_invoice_payment(uuid,uuid,numeric,public.payment_method,text,text) from public;
grant execute on function public.record_invoice_payment(uuid,uuid,numeric,public.payment_method,text,text) to authenticated;

-- ============ quotes ============
create or replace function public.create_quote(
  _business_id uuid,
  _customer_id uuid,
  _issue_date date,
  _valid_until date,
  _notes text,
  _terms text,
  _discount numeric,
  _items jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _quote_id uuid;
  _seq int;
  _prefix text;
  _number text;
  _subtotal numeric(14,2) := 0;
  _tax numeric(14,2) := 0;
  _total numeric(14,2);
  _item jsonb;
  _line_subtotal numeric(14,2);
  _line_tax numeric(14,2);
  _qty numeric(14,3);
  _price numeric(14,2);
begin
  if not public.has_business_role(_business_id, array['owner','admin','manager','accountant']::public.app_role[]) then
    raise exception 'You do not have permission to create quotes.' using errcode = 'B0002';
  end if;
  if _items is null or jsonb_array_length(_items) = 0 then
    raise exception 'A quote needs at least one item.' using errcode = 'B0001';
  end if;
  if _discount is null or _discount < 0 then
    raise exception 'Discount cannot be negative.' using errcode = 'B0001';
  end if;
  if _customer_id is not null and not exists (
    select 1 from public.customers where id = _customer_id and business_id = _business_id and deleted_at is null
  ) then
    raise exception 'That customer could not be found.' using errcode = 'B0001';
  end if;

  insert into public.business_counters (business_id) values (_business_id)
    on conflict (business_id) do nothing;
  update public.business_counters set quote_seq = quote_seq + 1
    where business_id = _business_id returning quote_seq into _seq;
  select quote_prefix into _prefix from public.businesses where id = _business_id;
  _number := coalesce(_prefix, 'QT') || '-' || lpad(_seq::text, 4, '0');

  insert into public.quotes (
    business_id, quote_number, customer_id, issue_date, valid_until, notes, terms, discount, status, created_by
  ) values (
    _business_id, _number, _customer_id, coalesce(_issue_date, current_date), _valid_until,
    nullif(trim(_notes), ''), nullif(trim(_terms), ''), _discount, 'draft', auth.uid()
  ) returning id into _quote_id;

  for _item in select * from jsonb_array_elements(_items)
  loop
    _qty := (_item->>'quantity')::numeric;
    _price := (_item->>'unitPrice')::numeric;
    if _qty is null or _qty <= 0 then
      raise exception 'Item quantity must be greater than zero.' using errcode = 'B0001';
    end if;
    if _price is null or _price < 0 then
      raise exception 'Item price cannot be negative.' using errcode = 'B0001';
    end if;
    _line_subtotal := round(_qty * _price, 2);
    _line_tax := round(_line_subtotal * coalesce((_item->>'taxRate')::numeric, 0) / 100, 2);
    insert into public.quote_items (
      business_id, quote_id, product_id, name, quantity, unit_price, discount, tax, line_total
    ) values (
      _business_id, _quote_id, nullif(_item->>'productId', '')::uuid,
      _item->>'name', _qty, _price, 0, _line_tax, _line_subtotal + _line_tax
    );
    _subtotal := _subtotal + _line_subtotal;
    _tax := _tax + _line_tax;
  end loop;

  _total := greatest(_subtotal - _discount + _tax, 0);
  update public.quotes set subtotal = _subtotal, tax = _tax, total = _total where id = _quote_id;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary, new_values)
  values (_business_id, auth.uid(), 'quote.created', 'quote', _quote_id,
    'Created quote ' || _number, jsonb_build_object('total', _total, 'status', 'draft'));

  return _quote_id;
end;
$$;
revoke all on function public.create_quote(uuid,uuid,date,date,text,text,numeric,jsonb) from public;
grant execute on function public.create_quote(uuid,uuid,date,date,text,text,numeric,jsonb) to authenticated;

create or replace function public.convert_quote_to_invoice(
  _business_id uuid, _quote_id uuid, _due_date date
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _quote public.quotes;
  _invoice_id uuid;
  _seq int;
  _prefix text;
  _number text;
begin
  if not public.has_business_role(_business_id, array['owner','admin','manager','accountant']::public.app_role[]) then
    raise exception 'You do not have permission to convert quotes.' using errcode = 'B0002';
  end if;

  select * into _quote from public.quotes where id = _quote_id and business_id = _business_id for update;
  if not found then
    raise exception 'That quote could not be found.' using errcode = 'B0001';
  end if;
  if _quote.status = 'converted' then
    raise exception 'This quote has already been converted.' using errcode = 'B0001';
  end if;
  if _quote.status in ('declined', 'expired') then
    raise exception 'A declined or expired quote cannot be converted.' using errcode = 'B0001';
  end if;

  insert into public.business_counters (business_id) values (_business_id)
    on conflict (business_id) do nothing;
  update public.business_counters set invoice_seq = invoice_seq + 1
    where business_id = _business_id returning invoice_seq into _seq;
  select invoice_prefix into _prefix from public.businesses where id = _business_id;
  _number := coalesce(_prefix, 'INV') || '-' || lpad(_seq::text, 4, '0');

  insert into public.invoices (
    business_id, invoice_number, customer_id, issue_date, due_date, notes, terms,
    discount, subtotal, tax, total, status, created_by
  ) values (
    _business_id, _number, _quote.customer_id, current_date, _due_date, _quote.notes, _quote.terms,
    _quote.discount, _quote.subtotal, _quote.tax, _quote.total, 'draft', auth.uid()
  ) returning id into _invoice_id;

  insert into public.invoice_items (business_id, invoice_id, product_id, name, quantity, unit_price, discount, tax, line_total)
  select business_id, _invoice_id, product_id, name, quantity, unit_price, discount, tax, line_total
  from public.quote_items where quote_id = _quote_id;

  update public.quotes set status = 'converted', converted_invoice_id = _invoice_id where id = _quote_id;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary, new_values)
  values (_business_id, auth.uid(), 'quote.converted', 'quote', _quote_id,
    'Converted quote ' || _quote.quote_number || ' to invoice ' || _number,
    jsonb_build_object('invoice_id', _invoice_id));

  return _invoice_id;
end;
$$;
revoke all on function public.convert_quote_to_invoice(uuid,uuid,date) from public;
grant execute on function public.convert_quote_to_invoice(uuid,uuid,date) to authenticated;
