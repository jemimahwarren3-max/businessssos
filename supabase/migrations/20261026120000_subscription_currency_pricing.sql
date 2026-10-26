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
  v_currency text := upper(trim(_currency));
  v_expected_amount numeric(12, 2);
begin
  if not public.has_business_role(_business_id, array['owner', 'admin']::public.app_role[]) then
    raise exception 'Only an owner or admin can start a subscription payment.' using errcode = 'B0002';
  end if;

  if _plan is distinct from 'pro'::public.plan_tier or _interval is distinct from 'month' then
    raise exception 'Only monthly Pro subscriptions can be paid here.' using errcode = 'B0001';
  end if;

  v_expected_amount := case v_currency
    when 'USD' then 7
    when 'ZWG' then 210
    else null
  end;
  if v_expected_amount is null then
    raise exception 'Subscription currency must be USD or ZWG.' using errcode = 'B0001';
  end if;
  if _amount is distinct from v_expected_amount then
    raise exception 'Subscription amount does not match the fixed plan price.' using errcode = 'B0001';
  end if;

  insert into public.subscription_payments (
    business_id, reference, plan, interval, amount, currency, poll_url
  )
  values (_business_id, _reference, _plan, _interval, _amount, v_currency, _poll_url)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.record_subscription_payment(uuid, text, public.plan_tier, text, numeric, text, text) from public, anon;
grant execute on function public.record_subscription_payment(uuid, text, public.plan_tier, text, numeric, text, text) to authenticated;
