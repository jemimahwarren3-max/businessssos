-- Recurring invoices — a template (customer, items, cadence) that generates
-- a real draft invoice each time it comes due. No cron/scheduler exists in
-- this project yet; generate_due_recurring_invoices() is the function a
-- daily GitHub Action (see .github/workflows/recurring-invoices.yml) calls
-- via the service role key, same trust model as supabaseAdmin elsewhere —
-- there's no authenticated user driving it, so it can't reuse create_invoice
-- (which checks has_business_role against auth.uid()); it duplicates that
-- function's numbering/item-insertion logic directly instead, rather than
-- weakening create_invoice's own security boundary to accept a system caller.

create type public.recurrence_interval as enum ('weekly', 'monthly', 'quarterly', 'yearly');

create table public.recurring_invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  interval public.recurrence_interval not null,
  next_issue_date date not null,
  due_days integer not null default 14 check (due_days >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  notes text,
  terms text,
  items jsonb not null,
  is_active boolean not null default true,
  last_invoice_id uuid references public.invoices(id) on delete set null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index recurring_invoices_business_idx on public.recurring_invoices(business_id);
create index recurring_invoices_due_idx on public.recurring_invoices(next_issue_date) where is_active;

alter table public.recurring_invoices enable row level security;
create policy "members read recurring_invoices" on public.recurring_invoices for select to authenticated
  using (public.is_business_member(business_id));
-- No direct insert/update/delete policy — writes only through the RPCs
-- below (security definer, their own role checks), same pattern as
-- sale_refunds and the purchase-order status workflow.

create trigger recurring_invoices_updated before update on public.recurring_invoices
  for each row execute function public.set_updated_at();

create or replace function public.create_recurring_invoice(
  _business_id uuid,
  _customer_id uuid,
  _interval public.recurrence_interval,
  _start_date date,
  _due_days integer,
  _discount numeric,
  _notes text,
  _terms text,
  _items jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _id uuid;
begin
  if not public.has_business_role(_business_id, array['owner','admin','manager','accountant']::public.app_role[]) then
    raise exception 'You do not have permission to create recurring invoices.' using errcode = 'B0002';
  end if;
  if _items is null or jsonb_array_length(_items) = 0 then
    raise exception 'A recurring invoice needs at least one item.' using errcode = 'B0001';
  end if;
  if _customer_id is null then
    raise exception 'Select a customer for a recurring invoice.' using errcode = 'B0001';
  end if;
  if not exists (
    select 1 from public.customers where id = _customer_id and business_id = _business_id and deleted_at is null
  ) then
    raise exception 'That customer could not be found.' using errcode = 'B0001';
  end if;
  if _discount is null or _discount < 0 then
    raise exception 'Discount cannot be negative.' using errcode = 'B0001';
  end if;

  insert into public.recurring_invoices (
    business_id, customer_id, interval, next_issue_date, due_days, discount, notes, terms, items, created_by
  ) values (
    _business_id, _customer_id, _interval, coalesce(_start_date, current_date), coalesce(_due_days, 14),
    _discount, nullif(trim(_notes), ''), nullif(trim(_terms), ''), _items, auth.uid()
  ) returning id into _id;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary, new_values)
  values (_business_id, auth.uid(), 'recurring_invoice.created', 'recurring_invoice', _id,
    'Created a ' || _interval || ' recurring invoice', jsonb_build_object('interval', _interval));

  return _id;
end;
$$;
revoke all on function public.create_recurring_invoice(uuid,uuid,public.recurrence_interval,date,integer,numeric,text,text,jsonb) from public, anon;
grant execute on function public.create_recurring_invoice(uuid,uuid,public.recurrence_interval,date,integer,numeric,text,text,jsonb) to authenticated;

create or replace function public.set_recurring_invoice_active(
  _business_id uuid,
  _id uuid,
  _active boolean
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_business_role(_business_id, array['owner','admin','manager','accountant']::public.app_role[]) then
    raise exception 'Your role does not allow this action.' using errcode = 'B0002';
  end if;
  update public.recurring_invoices set is_active = _active
    where id = _id and business_id = _business_id;
  if not found then
    raise exception 'That recurring invoice could not be found.' using errcode = 'B0001';
  end if;
end;
$$;
revoke all on function public.set_recurring_invoice_active(uuid,uuid,boolean) from public, anon;
grant execute on function public.set_recurring_invoice_active(uuid,uuid,boolean) to authenticated;

create or replace function public.delete_recurring_invoice(_business_id uuid, _id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_business_role(_business_id, array['owner','admin','manager','accountant']::public.app_role[]) then
    raise exception 'Your role does not allow this action.' using errcode = 'B0002';
  end if;
  delete from public.recurring_invoices where id = _id and business_id = _business_id;
  if not found then
    raise exception 'That recurring invoice could not be found.' using errcode = 'B0001';
  end if;
end;
$$;
revoke all on function public.delete_recurring_invoice(uuid,uuid) from public, anon;
grant execute on function public.delete_recurring_invoice(uuid,uuid) to authenticated;

-- System-only — no authenticated/anon grant. Callable solely with the
-- service role key (PostgREST sets role to service_role for that key,
-- which bypasses RLS entirely), matching the daily GitHub Action.
create or replace function public.generate_due_recurring_invoices() returns int
language plpgsql security definer set search_path = public as $$
declare
  _r record;
  _invoice_id uuid;
  _seq int;
  _prefix text;
  _number text;
  _due_date date;
  _subtotal numeric(14,2);
  _tax numeric(14,2);
  _total numeric(14,2);
  _item jsonb;
  _line_subtotal numeric(14,2);
  _line_tax numeric(14,2);
  _qty numeric(14,3);
  _price numeric(14,2);
  _count int := 0;
  _next_interval interval;
begin
  for _r in
    select * from public.recurring_invoices
    where is_active and next_issue_date <= current_date
    for update
  loop
    _subtotal := 0;
    _tax := 0;
    _due_date := _r.next_issue_date + (_r.due_days || ' days')::interval;

    insert into public.business_counters (business_id) values (_r.business_id)
      on conflict (business_id) do nothing;
    update public.business_counters set invoice_seq = invoice_seq + 1
      where business_id = _r.business_id returning invoice_seq into _seq;
    select invoice_prefix into _prefix from public.businesses where id = _r.business_id;
    _number := coalesce(_prefix, 'INV') || '-' || lpad(_seq::text, 4, '0');

    insert into public.invoices (
      business_id, invoice_number, customer_id, issue_date, due_date, notes, terms, discount, status
    ) values (
      _r.business_id, _number, _r.customer_id, _r.next_issue_date, _due_date, _r.notes, _r.terms, _r.discount, 'draft'
    ) returning id into _invoice_id;

    for _item in select * from jsonb_array_elements(_r.items)
    loop
      _qty := (_item->>'quantity')::numeric;
      _price := (_item->>'unitPrice')::numeric;
      _line_subtotal := round(_qty * _price, 2);
      _line_tax := round(_line_subtotal * coalesce((_item->>'taxRate')::numeric, 0) / 100, 2);
      insert into public.invoice_items (
        business_id, invoice_id, product_id, name, quantity, unit_price, discount, tax, line_total
      ) values (
        _r.business_id, _invoice_id, nullif(_item->>'productId', '')::uuid,
        _item->>'name', _qty, _price, 0, _line_tax, _line_subtotal + _line_tax
      );
      _subtotal := _subtotal + _line_subtotal;
      _tax := _tax + _line_tax;
    end loop;

    _total := greatest(_subtotal - _r.discount + _tax, 0);
    update public.invoices set subtotal = _subtotal, tax = _tax, total = _total where id = _invoice_id;

    insert into public.audit_logs (business_id, action, entity_type, entity_id, summary, new_values)
    values (_r.business_id, 'invoice.created', 'invoice', _invoice_id,
      'Generated recurring invoice ' || _number,
      jsonb_build_object('total', _total, 'status', 'draft', 'recurring', true));

    _next_interval := case _r.interval
      when 'weekly' then interval '7 days'
      when 'monthly' then interval '1 month'
      when 'quarterly' then interval '3 months'
      when 'yearly' then interval '1 year'
    end;
    update public.recurring_invoices
      set next_issue_date = (_r.next_issue_date + _next_interval)::date, last_invoice_id = _invoice_id
      where id = _r.id;

    _count := _count + 1;
  end loop;
  return _count;
end;
$$;
revoke all on function public.generate_due_recurring_invoices() from public, anon, authenticated;
grant execute on function public.generate_due_recurring_invoices() to service_role;

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
      'recurring_invoice.created'
    )
  );
