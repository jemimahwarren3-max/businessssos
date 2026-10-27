-- Stage 4: storefront launch fee, eligibility, suspension, and publish guards.

alter table public.platform_runtime
  add column if not exists launch_fee_usd numeric(12,2) not null default 15 check (launch_fee_usd > 0),
  add column if not exists launch_fee_required boolean not null default false;

comment on column public.platform_runtime.launch_fee_usd is
  'One-time Kwetuu store launch fee in USD when launch_fee_required is true.';
comment on column public.platform_runtime.launch_fee_required is
  'When true and billing is enforced, publish requires a verified launch-fee payment or admin waiver.';

alter table public.storefronts
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_by uuid references auth.users(id),
  add column if not exists suspend_reason text,
  add column if not exists launch_fee_waived_at timestamptz,
  add column if not exists launch_fee_waived_by uuid references auth.users(id),
  add column if not exists launch_fee_waive_reason text;

create table if not exists public.storefront_launch_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  provider text not null default 'paynow',
  reference text not null,
  provider_reference text,
  poll_url text not null,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'USD',
  status text not null default 'created' check (status in ('created', 'paid', 'failed', 'cancelled')),
  raw_status text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  unique (provider, reference)
);
create index if not exists storefront_launch_payments_business_idx
  on public.storefront_launch_payments(business_id, created_at desc);

alter table public.storefront_launch_payments enable row level security;
revoke all on public.storefront_launch_payments from public, anon;
grant select on public.storefront_launch_payments to authenticated;
grant all on public.storefront_launch_payments to service_role;

drop policy if exists "members read storefront launch payments" on public.storefront_launch_payments;
create policy "members read storefront launch payments" on public.storefront_launch_payments
  for select to authenticated using (public.is_business_member(business_id));

create or replace function public.platform_launch_fee_required()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select launch_fee_required from public.platform_runtime where id = 1),
    false
  );
$$;
revoke all on function public.platform_launch_fee_required() from public, anon;
grant execute on function public.platform_launch_fee_required() to authenticated, service_role;

create or replace function public.platform_launch_fee_usd()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select launch_fee_usd from public.platform_runtime where id = 1),
    15::numeric
  );
$$;
revoke all on function public.platform_launch_fee_usd() from public, anon;
grant execute on function public.platform_launch_fee_usd() to authenticated, service_role;

create or replace function public.storefront_launch_fee_satisfied(_business_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _store public.storefronts;
begin
  if not public.platform_billing_enforced() or not public.platform_launch_fee_required() then
    return true;
  end if;
  select * into _store from public.storefronts where business_id = _business_id;
  if found and _store.launch_fee_waived_at is not null then
    return true;
  end if;
  return exists (
    select 1 from public.storefront_launch_payments p
    where p.business_id = _business_id and p.status = 'paid'
  );
end;
$$;
revoke all on function public.storefront_launch_fee_satisfied(uuid) from public, anon;
grant execute on function public.storefront_launch_fee_satisfied(uuid) to authenticated, service_role;

create or replace function public.record_storefront_launch_payment(
  _business_id uuid,
  _reference text,
  _amount numeric,
  _currency text,
  _poll_url text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.has_business_role(_business_id, array['owner', 'admin']::public.app_role[]) then
    raise exception 'Only an owner or admin can start a launch-fee payment.' using errcode = 'B0002';
  end if;
  if public.storefront_launch_fee_satisfied(_business_id) then
    raise exception 'Launch fee is already satisfied for this shop.' using errcode = 'B0001';
  end if;
  insert into public.storefront_launch_payments (
    business_id, reference, amount, currency, poll_url
  )
  values (_business_id, _reference, _amount, _currency, _poll_url)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.record_storefront_launch_payment(uuid, text, numeric, text, text) from public;
grant execute on function public.record_storefront_launch_payment(uuid, text, numeric, text, text) to authenticated;

create or replace function public.paynow_confirm_launch_payment(
  _reference text,
  _provider_reference text,
  _raw_status text,
  _paid boolean
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_payment record;
begin
  select * into v_payment from public.storefront_launch_payments where reference = _reference for update;
  if not found then
    raise exception 'Unknown launch payment reference: %', _reference using errcode = 'B0001';
  end if;
  if v_payment.status != 'created' then
    return;
  end if;
  update public.storefront_launch_payments
    set status = case when _paid then 'paid' else 'failed' end,
        provider_reference = coalesce(_provider_reference, provider_reference),
        raw_status = _raw_status,
        paid_at = case when _paid then now() else null end
    where reference = _reference;
  if _paid then
    insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary)
    values (
      v_payment.business_id,
      null,
      'storefront.launch_fee_paid',
      'storefront_launch_payment',
      v_payment.id,
      'Launch fee verified via Paynow'
    );
  end if;
end;
$$;
revoke all on function public.paynow_confirm_launch_payment(text, text, text, boolean) from public;
grant execute on function public.paynow_confirm_launch_payment(text, text, text, boolean) to service_role;

create or replace function public.get_store_launch_eligibility(_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _store public.storefronts;
  _checklist jsonb;
  _billing_enforced boolean;
  _launch_required boolean;
  _launch_usd numeric;
  _launch_paid boolean;
  _launch_pending boolean;
  _launch_failed boolean;
  _subscription_ok boolean;
  _online_shop boolean;
  _setup_complete boolean;
  _state text;
  _latest_launch jsonb;
begin
  if not public.is_business_member(_business_id) then
    raise exception 'Your role does not allow this action.' using errcode = 'B0002';
  end if;
  select * into _store from public.storefronts where business_id = _business_id;
  _checklist := coalesce((public.get_storefront_admin(_business_id)->'checklist'), '{}'::jsonb);
  _billing_enforced := public.platform_billing_enforced();
  _launch_required := public.platform_launch_fee_required() and _billing_enforced;
  _launch_usd := public.platform_launch_fee_usd();
  _launch_paid := public.storefront_launch_fee_satisfied(_business_id);
  _subscription_ok := not _billing_enforced
    or public.has_platform_subscription_bypass()
    or public.business_can_operate(_business_id);
  select exists (
    select 1 from public.storefront_launch_payments p
    where p.business_id = _business_id and p.status = 'created'
  ) into _launch_pending;
  select exists (
    select 1 from public.storefront_launch_payments p
    where p.business_id = _business_id and p.status = 'failed'
      and not exists (
        select 1 from public.storefront_launch_payments p2
        where p2.business_id = _business_id and p2.status = 'paid'
      )
  ) into _launch_failed;
  select coalesce(
    (public.get_business_feature_flags(_business_id)->>'onlineShopEnabled')::boolean,
    true
  ) into _online_shop;
  _setup_complete := coalesce((_checklist->>'name')::boolean, false)
    and coalesce((_checklist->>'template')::boolean, false)
    and coalesce((_checklist->>'products')::boolean, false)
    and coalesce((_checklist->>'payments')::boolean, false)
    and coalesce((_checklist->>'fulfilment')::boolean, false)
    and coalesce((_checklist->>'policies')::boolean, false)
    and coalesce((_checklist->>'previewed')::boolean, false);

  if _store.suspended_at is not null then
    _state := 'suspended';
  elsif _store.status = 'published' then
    _state := 'published';
  elsif not _online_shop then
    _state := 'blocked';
  elsif not coalesce((_checklist->>'name')::boolean, false) then
    _state := 'setup_incomplete';
  elsif not _setup_complete then
    _state := 'setup_incomplete';
  elsif _launch_required and not _launch_paid and _launch_pending then
    _state := 'payment_pending_verification';
  elsif _launch_required and not _launch_paid and _launch_failed then
    _state := 'payment_verification_failed';
  elsif _launch_required and not _launch_paid then
    _state := 'launch_fee_unpaid';
  elsif _billing_enforced and not _subscription_ok then
    _state := 'subscription_inactive';
  elsif _setup_complete then
    _state := 'eligible_to_publish';
  else
    _state := 'ready_for_review';
  end if;

  select jsonb_build_object(
    'reference', p.reference,
    'status', p.status,
    'amount', p.amount,
    'currency', p.currency,
    'createdAt', p.created_at
  )
  into _latest_launch
  from public.storefront_launch_payments p
  where p.business_id = _business_id
  order by p.created_at desc
  limit 1;

  return jsonb_build_object(
    'state', _state,
    'storeStatus', coalesce(_store.status, 'draft'),
    'suspended', _store.suspended_at is not null,
    'suspendReason', coalesce(_store.suspend_reason, ''),
    'setupComplete', _setup_complete,
    'checklist', _checklist,
    'billingEnforced', _billing_enforced,
    'launchFeeRequired', _launch_required,
    'launchFeeUsd', _launch_usd,
    'launchFeeSatisfied', _launch_paid,
    'launchFeeWaived', _store.launch_fee_waived_at is not null,
    'subscriptionActive', _subscription_ok,
    'onlineShopEnabled', _online_shop,
    'latestLaunchPayment', coalesce(_latest_launch, 'null'::jsonb)
  );
end;
$$;
revoke all on function public.get_store_launch_eligibility(uuid) from public, anon;
grant execute on function public.get_store_launch_eligibility(uuid) to authenticated;

create or replace function public.set_storefront_published(_business_id uuid, _published boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _store public.storefronts;
  _listed int;
  _online_shop boolean;
begin
  perform public.storefront_require_settings(_business_id);
  select * into _store from public.storefronts where business_id = _business_id;
  if not found then
    raise exception 'Save the shop details before publishing.' using errcode = 'B0001';
  end if;
  if _published then
    if _store.suspended_at is not null then
      raise exception 'This shop is suspended and cannot be published.' using errcode = 'B0002';
    end if;
    select coalesce(
      (public.get_business_feature_flags(_business_id)->>'onlineShopEnabled')::boolean,
      true
    ) into _online_shop;
    if not _online_shop then
      raise exception 'Online shop is disabled for this business. Contact Kwetuu support.' using errcode = 'B0002';
    end if;
    perform public.assert_business_can_operate(_business_id);
    if not public.storefront_launch_fee_satisfied(_business_id) then
      raise exception
        'Pay the store launch fee or contact Kwetuu support before publishing.'
        using errcode = 'B0002';
    end if;
    select count(*) into _listed from public.product_listings
      where business_id = _business_id and published;
    if _listed < 1 then
      raise exception 'Publish at least one product before opening the shop.' using errcode = 'B0001';
    end if;
    if coalesce((_store.delivery->>'pickupEnabled')::boolean, false) is not true
       and coalesce((_store.delivery->>'deliveryEnabled')::boolean, false) is not true
       and coalesce((_store.payments->>'quotes')::boolean, false) is not true then
      raise exception 'Turn on pickup, delivery, or quote requests before publishing.' using errcode = 'B0001';
    end if;
    if coalesce((_store.payments->>'payOnPickup')::boolean, false) is not true
       and coalesce((_store.payments->>'payOnDelivery')::boolean, false) is not true
       and coalesce((_store.payments->>'quotes')::boolean, false) is not true then
      raise exception 'Turn on a payment method customers can actually use.' using errcode = 'B0001';
    end if;
    update public.storefronts
      set status = 'published', published_at = coalesce(published_at, now())
      where business_id = _business_id;
    insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary)
    values (_business_id, auth.uid(), 'storefront.published', 'storefront', _business_id, 'Published online shop');
  else
    update public.storefronts set status = 'draft' where business_id = _business_id;
    insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary)
    values (_business_id, auth.uid(), 'storefront.unpublished', 'storefront', _business_id, 'Unpublished online shop');
  end if;
  return public.get_storefront_admin(_business_id);
end;
$$;

create or replace function public.get_public_store(
  _slug text,
  _query text default null,
  _category text default null,
  _sort text default 'featured',
  _limit int default 48,
  _offset int default 0
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _payload jsonb;
  _business_id uuid;
  _store public.storefronts;
begin
  select * into _store
  from public.storefronts
  where slug = lower(coalesce(_slug, ''))
    and status = 'published'
    and suspended_at is null;
  if not found then
    return null;
  end if;
  _payload := public.get_public_store_gallery_base(_slug, _query, _category, _sort, _limit, _offset);
  if _payload is null then
    return null;
  end if;
  _business_id := _store.business_id;
  return jsonb_set(
    _payload,
    '{products}',
    public.storefront_attach_product_media(
      public.storefront_apply_listing_names(_payload->'products', _business_id, false),
      _business_id
    ),
    true
  );
end;
$$;

-- Platform admin (service_role from Node after MFA): waive launch fee, suspend/restore storefront
create or replace function public.admin_waive_store_launch_fee(
  _business_id uuid,
  _reason text,
  _actor_user_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if _reason is null or length(trim(_reason)) < 4 then
    raise exception 'Enter a reason for the launch-fee exception.' using errcode = 'B0001';
  end if;
  update public.storefronts
  set launch_fee_waived_at = now(),
      launch_fee_waived_by = _actor_user_id,
      launch_fee_waive_reason = trim(_reason)
  where business_id = _business_id;
  if not found then
    raise exception 'Storefront not found for this business.' using errcode = 'B0001';
  end if;
  insert into public.platform_admin_audit (actor_user_id, action, reason, outcome, detail)
  values (
    _actor_user_id,
    'storefront.launch_fee_waived',
    trim(_reason),
    'success',
    jsonb_build_object('businessId', _business_id)
  );
end;
$$;
revoke all on function public.admin_waive_store_launch_fee(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_waive_store_launch_fee(uuid, text, uuid) to service_role;

create or replace function public.admin_set_storefront_suspended(
  _business_id uuid,
  _suspended boolean,
  _reason text,
  _actor_user_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if _suspended then
    if _reason is null or length(trim(_reason)) < 4 then
      raise exception 'Enter a reason for suspension.' using errcode = 'B0001';
    end if;
    update public.storefronts
    set suspended_at = now(),
        suspended_by = _actor_user_id,
        suspend_reason = trim(_reason),
        status = 'draft'
    where business_id = _business_id;
  else
    update public.storefronts
    set suspended_at = null,
        suspended_by = null,
        suspend_reason = null
    where business_id = _business_id;
  end if;
  if not found then
    raise exception 'Storefront not found for this business.' using errcode = 'B0001';
  end if;
  insert into public.platform_admin_audit (actor_user_id, action, reason, outcome, detail)
  values (
    _actor_user_id,
    case when _suspended then 'storefront.suspended' else 'storefront.unsuspended' end,
    coalesce(nullif(trim(_reason), ''), 'Restored storefront access'),
    'success',
    jsonb_build_object('businessId', _business_id, 'suspended', _suspended)
  );
end;
$$;
revoke all on function public.admin_set_storefront_suspended(uuid, boolean, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_set_storefront_suspended(uuid, boolean, text, uuid) to service_role;

create or replace function public.admin_list_storefront_launch_payments(_business_id uuid, _limit int default 20)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'reference', p.reference,
        'status', p.status,
        'amount', p.amount,
        'currency', p.currency,
        'createdAt', p.created_at,
        'paidAt', p.paid_at
      )
      order by p.created_at desc
    ),
    '[]'::jsonb
  )
  from (
    select * from public.storefront_launch_payments
    where business_id = _business_id
    order by created_at desc
    limit greatest(1, least(_limit, 100))
  ) p;
$$;
revoke all on function public.admin_list_storefront_launch_payments(uuid, int) from public, anon, authenticated;
grant execute on function public.admin_list_storefront_launch_payments(uuid, int) to service_role;
