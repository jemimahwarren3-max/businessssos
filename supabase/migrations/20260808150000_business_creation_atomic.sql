-- createBusinessRecord (src/lib/business.server.ts) did five sequential,
-- unguarded inserts across four tables plus an RPC call — a failure partway
-- through (e.g. the subscription bootstrap) left an orphaned business with a
-- membership row but no settings/subscription. Collapsing all of it into one
-- SECURITY DEFINER function makes it one implicit transaction: all of it
-- commits, or none of it does.
create or replace function public.create_business_with_owner(
  _name text,
  _business_type public.business_type,
  _currency text,
  _phone text,
  _address text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_business_id uuid;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'You must be signed in to create a business.' using errcode = 'B0002';
  end if;

  insert into public.businesses (
    name, business_type, currency, phone, address, created_by, onboarding_completed
  )
  values (
    _name, _business_type, _currency, nullif(_phone, ''), nullif(_address, ''), v_user_id, true
  )
  returning id into v_business_id;

  insert into public.business_members (business_id, user_id, role)
  values (v_business_id, v_user_id, 'owner');

  insert into public.business_settings (business_id) values (v_business_id);

  insert into public.subscriptions (
    business_id, plan, status, trial_ends_at, current_period_start, current_period_end
  )
  values (
    v_business_id, 'business', 'trialing', now() + interval '14 days', now(), now() + interval '14 days'
  );

  return v_business_id;
end;
$$;
revoke all on function public.create_business_with_owner(text, public.business_type, text, text, text) from public;
grant execute on function public.create_business_with_owner(text, public.business_type, text, text, text) to authenticated;
