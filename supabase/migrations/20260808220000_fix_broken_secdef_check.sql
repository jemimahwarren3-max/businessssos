-- The `current_user <> 'service_role'` check added to these functions in
-- 20260808210000 is fundamentally broken and must come out immediately:
-- inside a SECURITY DEFINER function, current_user is always the
-- function's OWNER (postgres, since migrations run as postgres), never the
-- actual caller — that's the whole point of SECURITY DEFINER. Confirmed
-- live: even after `set role service_role`, current_user inside such a
-- function still reports 'postgres'. Left in place, this would reject
-- every legitimate service_role call in production too, including the real
-- Paynow webhook once it has live credentials — not just the unauthorized
-- ones it was meant to stop.
--
-- The actual, correct defense — revoking EXECUTE from anon/authenticated
-- and granting only to service_role, applied in the same prior migration —
-- is unaffected by this and remains the real boundary. Postgres checks
-- EXECUTE grants before a function body ever runs, regardless of
-- SECURITY DEFINER, which is exactly why it works and an internal
-- current_user check doesn't.
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
revoke all on function public.paynow_confirm_payment(text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.paynow_confirm_payment(text, text, text, boolean) to service_role;

create or replace function public.admin_list_subscriptions()
returns table (
  business_id uuid,
  business_name text,
  business_type public.business_type,
  business_created_at timestamptz,
  plan public.plan_tier,
  status public.subscription_status,
  "interval" text,
  trial_ends_at timestamptz,
  current_period_end timestamptz
)
language sql stable security definer set search_path = public as $$
  select b.id, b.name, b.business_type, b.created_at,
         s.plan, s.status, s.interval, s.trial_ends_at, s.current_period_end
  from public.businesses b
  left join public.subscriptions s on s.business_id = b.id
  order by b.created_at desc;
$$;
revoke all on function public.admin_list_subscriptions() from public, anon, authenticated;
grant execute on function public.admin_list_subscriptions() to service_role;

create or replace function public.admin_list_payments(_limit int default 50)
returns table (
  reference text,
  business_id uuid,
  business_name text,
  plan public.plan_tier,
  "interval" text,
  amount numeric,
  currency text,
  status text,
  created_at timestamptz,
  paid_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select p.reference, p.business_id, b.name, p.plan, p.interval, p.amount,
         p.currency, p.status, p.created_at, p.paid_at
  from public.subscription_payments p
  join public.businesses b on b.id = p.business_id
  order by p.created_at desc
  limit greatest(_limit, 1);
$$;
revoke all on function public.admin_list_payments(int) from public, anon, authenticated;
grant execute on function public.admin_list_payments(int) to service_role;

create or replace function public.admin_platform_stats()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'businesses_total', (select count(*) from public.businesses),
    'businesses_by_status', (
      select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
      from (select status, count(*) n from public.subscriptions group by status) t
    ),
    'businesses_by_plan', (
      select coalesce(jsonb_object_agg(plan, n), '{}'::jsonb)
      from (select plan, count(*) n from public.subscriptions group by plan) t
    ),
    'signups_last_30_days', (
      select count(*) from public.businesses where created_at > now() - interval '30 days'
    ),
    'payments_paid_total', (
      select coalesce(sum(amount), 0) from public.subscription_payments where status = 'paid'
    ),
    'payments_paid_count', (
      select count(*) from public.subscription_payments where status = 'paid'
    ),
    'payments_failed_count', (
      select count(*) from public.subscription_payments where status = 'failed'
    ),
    'payments_stuck_count', (
      select count(*) from public.subscription_payments
      where status = 'created' and created_at < now() - interval '1 hour'
    )
  );
$$;
revoke all on function public.admin_platform_stats() from public, anon, authenticated;
grant execute on function public.admin_platform_stats() to service_role;

create or replace function public.admin_override_subscription(
  _business_id uuid,
  _plan public.plan_tier,
  _status public.subscription_status,
  _current_period_end timestamptz,
  _reason text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.subscriptions
    set plan = _plan,
        status = _status,
        current_period_end = _current_period_end,
        updated_at = now()
    where business_id = _business_id;

  if not found then
    raise exception 'No subscription found for that business.' using errcode = 'B0001';
  end if;

  insert into public.subscription_events (business_id, event_type, payload)
  values (_business_id, 'subscription.adjusted', jsonb_build_object('plan', _plan, 'status', _status));

  insert into public.admin_audit_log (action, business_id, detail)
  values (
    'override_subscription', _business_id,
    jsonb_build_object('plan', _plan, 'status', _status, 'current_period_end', _current_period_end, 'reason', _reason)
  );
end;
$$;
revoke all on function public.admin_override_subscription(uuid, public.plan_tier, public.subscription_status, timestamptz, text) from public, anon, authenticated;
grant execute on function public.admin_override_subscription(uuid, public.plan_tier, public.subscription_status, timestamptz, text) to service_role;
