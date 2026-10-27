-- Customer complaints linked to a shop, and optionally to an order the
-- customer can prove with the access code. Reserved host labels for /privacy
-- and /terms.

create or replace function public.storefront_reserved_slug(_slug text)
returns boolean
language sql immutable as $$
  select _slug in (
    'admin', 'api', 'auth', 'dashboard', 'store', 'stores', 'settings', 'help',
    'legal', 'health', 'invite', 'staff-login', 'reset-password', 'sitemap',
    'robots', 'assets', 'public', 'login', 'signup', 'billing', 'onboarding',
    'sales', 'inventory', 'invoices', 'quotes', 'customers', 'expenses',
    'reports', 'insights', 'assistant', 'suppliers', 'commission', 'storefront',
    'account', 'checkout', 'cart', 'search', 'order', 'products',
    'privacy', 'terms', 'cookies', 'refunds',
    'www', 'app', 'market', 'mail', 'cdn', 'static', 'staging'
  );
$$;

create table if not exists public.store_complaints (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_id uuid references public.store_orders(id) on delete set null,
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  message text not null,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved')),
  merchant_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists store_complaints_business_idx
  on public.store_complaints (business_id, created_at desc);
create trigger store_complaints_updated before update on public.store_complaints
  for each row execute function public.set_updated_at();

alter table public.store_complaints enable row level security;
grant select on public.store_complaints to authenticated;
grant all on public.store_complaints to service_role;

drop policy if exists store_complaints_member_read on public.store_complaints;
create policy store_complaints_member_read on public.store_complaints
  for select to authenticated
  using (public.is_business_member(business_id));

create or replace function public.create_store_complaint(
  _slug text,
  _customer jsonb,
  _message text,
  _reference text default null,
  _token text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _store public.storefronts;
  _order public.store_orders;
  _order_id uuid;
  _name text;
  _phone text;
  _email text;
  _body text;
  _id uuid;
begin
  if not public.check_rate_limit('store-complaint:' || coalesce(_slug, ''), 8, 60) then
    raise exception 'Too many reports just now. Please wait a minute and try again.' using errcode = 'B0001';
  end if;
  select * into _store from public.storefronts where slug = lower(coalesce(_slug, '')) and status = 'published';
  if not found then
    raise exception 'This shop is not available.' using errcode = 'B0001';
  end if;

  _name := public.storefront_plain(_customer->>'name', 80);
  _phone := regexp_replace(coalesce(_customer->>'phone', ''), '[^0-9+]', '', 'g');
  _email := nullif(public.storefront_plain(_customer->>'email', 120), '');
  _body := public.storefront_plain(_message, 2000);
  if _name is null or length(_name) < 2 then
    raise exception 'Enter your name.' using errcode = 'B0001';
  end if;
  if length(regexp_replace(_phone, '\D', '', 'g')) < 7 then
    raise exception 'Enter a phone number the shop can use.' using errcode = 'B0001';
  end if;
  if _body is null or length(_body) < 8 then
    raise exception 'Describe the problem in a bit more detail.' using errcode = 'B0001';
  end if;

  if nullif(btrim(coalesce(_reference, '')), '') is not null then
    select * into _order from public.store_orders
      where business_id = _store.business_id and reference = upper(btrim(_reference));
    if not found or _token is null or _order.token_hash <> extensions.crypt(_token, _order.token_hash) then
      raise exception 'That order could not be matched. Check the access code.' using errcode = 'B0001';
    end if;
    _order_id := _order.id;
  end if;

  insert into public.store_complaints (
    business_id, order_id, customer_name, customer_phone, customer_email, message
  ) values (
    _store.business_id, _order_id, _name, _phone, _email, _body
  ) returning id into _id;

  insert into public.notifications (business_id, type, title, message, severity, link)
  values (
    _store.business_id, 'store_complaint', 'Customer complaint',
    _name || ' reported a problem', 'warning', '/storefront'
  );

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary)
  values (_store.business_id, null, 'store_complaint.created', 'store_complaint', _id, 'Customer complaint');

  return jsonb_build_object('id', _id, 'status', 'open');
end;
$$;

create or replace function public.list_store_complaints(_business_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_business_member(_business_id) then
    raise exception 'You do not have access to this business.' using errcode = 'B0002';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id,
      'createdAt', c.created_at,
      'status', c.status,
      'customerName', c.customer_name,
      'customerPhone', c.customer_phone,
      'customerEmail', c.customer_email,
      'message', c.message,
      'merchantNote', c.merchant_note,
      'orderReference', o.reference
    ) order by c.created_at desc)
    from public.store_complaints c
    left join public.store_orders o on o.id = c.order_id
    where c.business_id = _business_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.respond_store_complaint(
  _business_id uuid,
  _complaint_id uuid,
  _status text,
  _note text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _row public.store_complaints;
begin
  if not public.is_business_member(_business_id) then
    raise exception 'You do not have access to this business.' using errcode = 'B0002';
  end if;
  if _status not in ('open', 'reviewing', 'resolved') then
    raise exception 'That complaint status is not valid.' using errcode = 'B0001';
  end if;
  select * into _row from public.store_complaints
    where id = _complaint_id and business_id = _business_id;
  if not found then
    raise exception 'That complaint could not be found.' using errcode = 'B0001';
  end if;
  update public.store_complaints
    set status = _status, merchant_note = nullif(public.storefront_plain(_note, 2000), '')
    where id = _complaint_id;
  return public.list_store_complaints(_business_id);
end;
$$;

revoke all on function public.create_store_complaint(text, jsonb, text, text, text) from public;
revoke all on function public.list_store_complaints(uuid) from public;
revoke all on function public.respond_store_complaint(uuid, uuid, text, text) from public;
grant execute on function public.create_store_complaint(text, jsonb, text, text, text) to anon, authenticated;
grant execute on function public.list_store_complaints(uuid) to authenticated;
grant execute on function public.respond_store_complaint(uuid, uuid, text, text) to authenticated;
