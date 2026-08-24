-- Paynow billing support, plus a pre-existing bug fix it depends on:
-- `subscriptions` has RLS enabled with only a SELECT policy (see the
-- 20260807043649 migration's grant/RLS loop) — there was never an INSERT
-- policy, so createBusinessRecord's `supabase.from("subscriptions").insert(...)`
-- (run with the RLS-enforced user client) has been silently failing for
-- every business ever created. Confirmed live: the one real business on
-- production has no subscriptions row at all. Fixing this here because the
-- new paynow_confirm_payment() function below updates subscriptions by
-- business_id, which is a no-op if the row was never created.

-- ============ fix: route subscription bootstrap through a definer fn ============
-- (never let the browser client write plan/status directly — the marketing
-- page already promises "verified with the payment provider, never trusted
-- from the browser"; this makes that literally true instead of accidental.)
create or replace function public.bootstrap_business_subscription(_business_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_business_role(_business_id, array['owner']::public.app_role[]) then
    raise exception 'Only the business owner can initialize billing.' using errcode = 'B0002';
  end if;

  insert into public.subscriptions (
    business_id, plan, status, trial_ends_at, current_period_start, current_period_end
  )
  values (
    _business_id, 'business', 'trialing', now() + interval '14 days', now(), now() + interval '14 days'
  )
  on conflict (business_id) do nothing;
end;
$$;
revoke all on function public.bootstrap_business_subscription(uuid) from public;
grant execute on function public.bootstrap_business_subscription(uuid) to authenticated;

-- Backfill every business that fell through the pre-existing bug.
insert into public.subscriptions (business_id, plan, status, trial_ends_at, current_period_start, current_period_end)
select b.id, 'business', 'trialing', now() + interval '14 days', now(), now() + interval '14 days'
from public.businesses b
where not exists (select 1 from public.subscriptions s where s.business_id = b.id);

-- ============ paynow billing ============
create table public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  provider text not null default 'paynow',
  reference text not null,
  provider_reference text,
  poll_url text not null,
  plan public.plan_tier not null,
  interval text not null default 'month',
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'USD',
  status text not null default 'created' check (status in ('created', 'paid', 'failed')),
  raw_status text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  unique (provider, reference)
);
create index subscription_payments_business_idx on public.subscription_payments(business_id, created_at desc);

alter table public.subscription_payments enable row level security;
-- Deliberately no insert/update/delete grant to authenticated at all — every
-- write goes through the definer functions below so a client can never mark
-- its own payment "paid".
grant select on public.subscription_payments to authenticated;
grant all on public.subscription_payments to service_role;
create policy "members read subscription payments" on public.subscription_payments
  for select to authenticated using (public.is_business_member(business_id));

-- Called by the server right after Paynow's send()/sendMobile() succeeds, so
-- poll_url is always known up front.
create or replace function public.record_subscription_payment(
  _business_id uuid,
  _reference text,
  _plan public.plan_tier,
  _interval text,
  _amount numeric,
  _currency text,
  _poll_url text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.has_business_role(_business_id, array['owner', 'admin']::public.app_role[]) then
    raise exception 'Only an owner or admin can start a subscription payment.' using errcode = 'B0002';
  end if;

  insert into public.subscription_payments (
    business_id, reference, plan, interval, amount, currency, poll_url
  )
  values (_business_id, _reference, _plan, _interval, _amount, _currency, _poll_url)
  returning id into v_id;

  return v_id;
end;
$$;
revoke all on function public.record_subscription_payment(uuid, text, public.plan_tier, text, numeric, text, text) from public;
grant execute on function public.record_subscription_payment(uuid, text, public.plan_tier, text, numeric, text, text) to authenticated;

-- Called only by our server's webhook/poll handler (service_role client) —
-- never by an end user. We only trust the _paid flag once it's been derived
-- from Paynow's own verified pollTransaction() response, not from an
-- unauthenticated webhook body directly (see src/lib/payments/paynow.server.ts).
create or replace function public.paynow_confirm_payment(
  _reference text,
  _provider_reference text,
  _raw_status text,
  _paid boolean
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_payment record;
  v_period_days int;
begin
  select * into v_payment from public.subscription_payments where reference = _reference for update;
  if not found then
    raise exception 'Unknown payment reference: %', _reference using errcode = 'B0001';
  end if;

  -- Idempotent: Paynow may call the result URL more than once, and we poll
  -- independently too — only act on the first confirmation.
  if v_payment.status != 'created' then
    return;
  end if;

  update public.subscription_payments
    set status = case when _paid then 'paid' else 'failed' end,
        provider_reference = coalesce(_provider_reference, provider_reference),
        raw_status = _raw_status,
        paid_at = case when _paid then now() else null end
    where reference = _reference;

  if _paid then
    v_period_days := case v_payment.interval when 'year' then 365 else 30 end;
    update public.subscriptions
      set plan = v_payment.plan,
          status = 'active',
          interval = v_payment.interval,
          provider = 'paynow',
          provider_subscription_id = v_payment.reference,
          current_period_start = now(),
          current_period_end = now() + (v_period_days || ' days')::interval,
          updated_at = now()
      where business_id = v_payment.business_id;

    insert into public.subscription_events (business_id, event_type, payload)
    values (
      v_payment.business_id,
      'paynow.payment_confirmed',
      jsonb_build_object(
        'reference', _reference, 'provider_reference', _provider_reference,
        'plan', v_payment.plan, 'interval', v_payment.interval, 'amount', v_payment.amount
      )
    );
  else
    insert into public.subscription_events (business_id, event_type, payload)
    values (
      v_payment.business_id, 'paynow.payment_failed',
      jsonb_build_object('reference', _reference, 'raw_status', _raw_status)
    );
  end if;
end;
$$;
revoke all on function public.paynow_confirm_payment(text, text, text, boolean) from public;
grant execute on function public.paynow_confirm_payment(text, text, text, boolean) to service_role;
