-- Atomic per-row sale-number generation for historical sales imports, mirroring
-- create_sale/create_invoice. Kept separate from create_sale because a bulk
-- spreadsheet import must never touch current stock or create inventory
-- movements — these sales already happened before the business used this app.
create or replace function public.import_sale_history_row(
  _business_id uuid,
  _sale_date timestamptz,
  _total numeric,
  _cost numeric,
  _description text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _seq int;
  _number text;
  _sale_id uuid;
  _cost_capped numeric(14,2);
begin
  if not public.has_business_role(_business_id, array['owner','admin','manager','accountant']::public.app_role[]) then
    raise exception 'You do not have permission to import sales.' using errcode = 'B0002';
  end if;
  if _total is null or _total <= 0 then
    raise exception 'Total must be greater than zero.' using errcode = 'B0001';
  end if;
  if _sale_date is null then
    raise exception 'Sale date is required.' using errcode = 'B0001';
  end if;

  insert into public.business_counters (business_id) values (_business_id)
    on conflict (business_id) do nothing;
  update public.business_counters set sale_seq = sale_seq + 1
    where business_id = _business_id returning sale_seq into _seq;
  _number := 'HIST-' || lpad(_seq::text, 4, '0');

  _cost_capped := least(greatest(coalesce(_cost, 0), 0), _total);

  insert into public.sales (
    business_id, sale_number, subtotal, tax, discount, total, cost_total, amount_paid,
    payment_method, status, notes, created_by, created_at
  ) values (
    _business_id, _number, _total, 0, 0, _total, _cost_capped, _total,
    'cash', 'completed', coalesce(nullif(trim(_description), ''), 'Imported from spreadsheet'),
    auth.uid(), _sale_date
  ) returning id into _sale_id;

  return _sale_id;
end;
$$;
revoke all on function public.import_sale_history_row(uuid,timestamptz,numeric,numeric,text) from public;
grant execute on function public.import_sale_history_row(uuid,timestamptz,numeric,numeric,text) to authenticated;
