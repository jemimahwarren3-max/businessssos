-- Additive payment safeguards. Apply to staging first; never auto-apply to production.

create table if not exists public.store_payment_provider_controls (
  provider text primary key check (provider in ('paynow')),
  enabled boolean not null default false,
  live_approved boolean not null default false,
  approval_reference text,
  updated_at timestamptz not null default now(),
  constraint store_payment_provider_controls_live_requires_enabled
    check (
      live_approved is false
      or (
        enabled is true
        and nullif(btrim(approval_reference), '') is not null
      )
    )
);

insert into public.store_payment_provider_controls (provider, enabled, live_approved)
values ('paynow', false, false)
on conflict (provider) do nothing;

alter table public.store_payment_provider_controls enable row level security;
revoke all on public.store_payment_provider_controls from public, anon, authenticated;
grant select, insert, update, delete on public.store_payment_provider_controls to service_role;

create table if not exists public.store_order_payment_confirmations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_id uuid not null unique references public.store_orders(id) on delete cascade,
  payment_method text not null check (
    payment_method in ('manual', 'pay_on_pickup', 'pay_on_delivery', 'quote')
  ),
  confirmation_reference text,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null,
  confirmed_by uuid not null references auth.users(id) on delete restrict,
  confirmed_at timestamptz not null default now()
);
create index if not exists store_order_payment_confirmations_business_idx
  on public.store_order_payment_confirmations (business_id, confirmed_at desc);
alter table public.store_order_payment_confirmations enable row level security;
revoke all on public.store_order_payment_confirmations from public, anon, authenticated;
grant select, insert on public.store_order_payment_confirmations to service_role;

create table if not exists public.store_paynow_credentials (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  ciphertext text not null,
  updated_at timestamptz not null default now()
);
alter table public.store_paynow_credentials enable row level security;
revoke all on public.store_paynow_credentials from public, anon, authenticated;
grant all on public.store_paynow_credentials to service_role;

create table if not exists public.shop_order_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_id uuid not null references public.store_orders(id) on delete cascade,
  reference text not null unique,
  poll_url text not null,
  status text not null default 'created',
  amount numeric(14,2) not null,
  currency text not null,
  channel text not null check (channel in ('web', 'ecocash')),
  provider_reference text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists shop_order_payments_order_idx
  on public.shop_order_payments (order_id);
alter table public.shop_order_payments enable row level security;
revoke all on public.shop_order_payments from public, anon, authenticated;
grant all on public.shop_order_payments to service_role;
grant select on public.shop_order_payments to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'shop_order_payments'
      and policyname = 'members read shop order payments'
  ) then
    create policy "members read shop order payments"
      on public.shop_order_payments for select to authenticated
      using (public.is_business_member(business_id));
  end if;
end $$;

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
      'store_order.claimed', 'store_order.proof_submitted', 'store_order.proof_rejected',
      'store_order.seller_payment_confirmed',
      'store_complaint.created', 'store_review.created', 'store_listing_report.created',
      'location.created', 'location.updated', 'location.deactivated',
      'cash_session.opened', 'cash_session.closed', 'cash.pay_in', 'cash.pay_out'
    )
  );

do $$
declare
  _constraint record;
begin
  for _constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.shop_order_payments'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.shop_order_payments drop constraint %I', _constraint.conname);
  end loop;
end $$;

alter table public.shop_order_payments
  add constraint shop_order_payments_status_check
  check (status in ('created', 'paid', 'failed', 'manual_review'));

create or replace function public.shop_offers_paynow(_slug text)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  _store public.storefronts;
begin
  select * into _store
  from public.storefronts
  where slug = lower(coalesce(_slug, ''));
  if not found or coalesce((_store.payments->>'acceptPaynow')::boolean, false) is not true then
    return false;
  end if;
  return exists (
    select 1
    from public.store_paynow_credentials c
    join public.store_payment_provider_controls p on p.provider = 'paynow'
    where c.business_id = _store.business_id
      and p.enabled
      and p.live_approved
  );
end;
$$;

create or replace function public.shop_offers_paynow_business(_business_id uuid)
returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_business_member(_business_id) then
    return false;
  end if;
  return exists (
    select 1
    from public.store_paynow_credentials c
    join public.store_payment_provider_controls p on p.provider = 'paynow'
    where c.business_id = _business_id
      and p.enabled
      and p.live_approved
  );
end;
$$;

create or replace function public.require_usd_shop_paynow_order()
returns trigger
language plpgsql set search_path = public as $$
begin
  if new.payment_method = 'paynow' and new.currency <> 'USD' then
    raise exception 'Shop Paynow is currently available only for USD orders.'
      using errcode = 'B0001';
  end if;
  return new;
end;
$$;

drop trigger if exists store_order_paynow_currency_guard on public.store_orders;
create trigger store_order_paynow_currency_guard
  before insert or update of payment_method, currency on public.store_orders
  for each row execute function public.require_usd_shop_paynow_order();

do $$
begin
  if to_regprocedure('public.transition_store_order_legacy_20261023(uuid,uuid,text)') is null then
    alter function public.transition_store_order(uuid, uuid, text)
      rename to transition_store_order_legacy_20261023;
  end if;
end $$;
revoke all on function public.transition_store_order_legacy_20261023(uuid, uuid, text)
  from public, anon, authenticated, service_role;

create or replace function public.record_store_order_payment(
  _business_id uuid,
  _order_id uuid,
  _confirmation_reference text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _order public.store_orders;
  _result jsonb;
  _confirmation_reference_clean text;
begin
  perform public.storefront_require_payments(_business_id);
  if auth.uid() is null then
    raise exception 'Sign in to record a seller-confirmed payment.' using errcode = 'B0002';
  end if;

  select * into _order
  from public.store_orders
  where id = _order_id and business_id = _business_id
  for update;
  if not found then
    raise exception 'That order could not be found.' using errcode = 'B0001';
  end if;
  if _order.payment_method = 'paynow' then
    raise exception 'Paynow orders can only be marked paid after Paynow verification.'
      using errcode = 'B0001';
  end if;
  if _order.payment_method not in ('manual', 'pay_on_pickup', 'pay_on_delivery', 'quote') then
    raise exception 'This order does not support seller-confirmed payment.'
      using errcode = 'B0001';
  end if;
  if _order.fulfilment_status = 'cancelled'
     or _order.payment_status in ('cancelled', 'expired', 'refunded') then
    raise exception 'This order cannot accept a payment confirmation.'
      using errcode = 'B0001';
  end if;
  if _order.payment_status = 'paid' or _order.sale_id is not null then
    return public.get_store_order_admin(_business_id, _order_id);
  end if;
  if _order.payment_method = 'quote'
     and _order.fulfilment_status = 'awaiting_confirmation' then
    raise exception 'Accept the quote before recording payment.' using errcode = 'B0001';
  end if;

  _confirmation_reference_clean :=
    nullif(public.storefront_plain(_confirmation_reference, 80), '');
  _result := public.transition_store_order_legacy_20261023(
    _business_id, _order_id, 'mark_paid'
  );

  insert into public.store_order_payment_confirmations (
    business_id, order_id, payment_method, confirmation_reference,
    amount, currency, confirmed_by
  ) values (
    _business_id, _order_id, _order.payment_method, _confirmation_reference_clean,
    _order.total, _order.currency, auth.uid()
  );
  insert into public.store_order_events (business_id, order_id, event_type, message)
  values (
    _business_id, _order_id, 'seller_payment_confirmed',
    'Seller confirmed the payment after checking their own account or receiving cash. This is not provider-verified.'
  );
  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary)
  values (
    _business_id, auth.uid(), 'store_order.seller_payment_confirmed',
    'store_order', _order_id, 'Seller confirmed payment for ' || _order.reference
  );
  return _result;
end;
$$;

create or replace function public.transition_store_order(
  _business_id uuid,
  _order_id uuid,
  _action text
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if _action = 'mark_paid' then
    return public.record_store_order_payment(_business_id, _order_id, null);
  end if;
  return public.transition_store_order_legacy_20261023(_business_id, _order_id, _action);
end;
$$;

revoke all on function public.record_store_order_payment(uuid, uuid, text)
  from public, anon;
revoke all on function public.transition_store_order(uuid, uuid, text)
  from public, anon;
grant execute on function public.record_store_order_payment(uuid, uuid, text)
  to authenticated;
grant execute on function public.transition_store_order(uuid, uuid, text)
  to authenticated;

drop function if exists public.confirm_shop_paynow_payment(text, text, text, boolean);

create function public.confirm_shop_paynow_payment(
  _reference text,
  _provider_reference text,
  _raw_status text,
  _paid boolean
) returns text
language plpgsql security definer set search_path = public as $$
declare
  _payment public.shop_order_payments;
  _order public.store_orders;
  _status text := lower(btrim(coalesce(_raw_status, '')));
begin
  if auth.role() <> 'service_role' then
    raise exception 'Not allowed.' using errcode = 'B0002';
  end if;
  select * into _payment
  from public.shop_order_payments
  where reference = _reference
  for update;
  if not found then
    raise exception 'Unknown payment reference.' using errcode = 'B0001';
  end if;
  if _payment.status <> 'created' then
    return _payment.status;
  end if;
  if (_paid and _status <> 'paid')
     or (not _paid and _status not in ('cancelled', 'disputed')) then
    raise exception 'Paynow status is not a recognized final state.' using errcode = 'B0001';
  end if;

  select * into _order
  from public.store_orders
  where id = _payment.order_id and business_id = _payment.business_id
  for update;
  if not found
     or _order.payment_method <> 'paynow'
     or _order.total <> _payment.amount
     or _order.currency <> _payment.currency
     or _payment.currency <> 'USD' then
    update public.shop_order_payments
      set status = 'manual_review',
          provider_reference = coalesce(_provider_reference, provider_reference)
      where id = _payment.id;
    insert into public.store_order_events (business_id, order_id, event_type, message)
    values (
      _payment.business_id, _payment.order_id, 'payment_review',
      'A Paynow response did not match this order. Payment was not recorded as paid; contact support to investigate.'
    );
    return 'manual_review';
  end if;

  if _paid and (
    _order.fulfilment_status = 'cancelled'
    or _order.payment_status in ('paid', 'cancelled', 'expired', 'refunded')
    or _order.sale_id is not null
  ) then
    update public.shop_order_payments
      set status = 'manual_review',
          provider_reference = coalesce(_provider_reference, provider_reference)
      where id = _payment.id;
    insert into public.store_order_events (business_id, order_id, event_type, message)
    values (
      _payment.business_id, _payment.order_id, 'payment_review',
      'Paynow reported payment for an order that cannot be automatically confirmed. Contact support to investigate.'
    );
    return 'manual_review';
  end if;

  if _paid then
    update public.shop_order_payments
      set status = 'paid',
          provider_reference = coalesce(_provider_reference, provider_reference),
          paid_at = now()
      where id = _payment.id;
    perform public.storefront_record_sale(_payment.order_id);
    insert into public.store_order_events (business_id, order_id, event_type, message)
    values (
      _payment.business_id, _payment.order_id, 'paid',
      'Paynow verified the payment. This is the same receipt the customer sees.'
    );
    return 'paid';
  end if;

  update public.shop_order_payments
    set status = 'failed',
        provider_reference = coalesce(_provider_reference, provider_reference)
    where id = _payment.id;
  insert into public.store_order_events (business_id, order_id, event_type, message)
  values (
    _payment.business_id, _payment.order_id, 'payment_failed',
    'Paynow did not complete this payment. The order is still unpaid.'
  );
  return 'failed';
end;
$$;

revoke all on function public.confirm_shop_paynow_payment(text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.confirm_shop_paynow_payment(text, text, text, boolean)
  to service_role;
