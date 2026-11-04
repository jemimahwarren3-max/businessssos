-- Staging can keep older create_business_with_owner signatures next to the
-- current 7-arg function (5 required + business_path + onboarding_config jsonb).
-- Five-arg calls then fail with "function is not unique". Keep only the jsonb
-- signature from 20261103080000_onboarding_journey.sql.

do $$
declare
  leftover record;
begin
  for leftover in
    select p.oid, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'create_business_with_owner'
      and pg_get_function_identity_arguments(p.oid) not like '%jsonb%'
  loop
    execute format(
      'drop function if exists public.create_business_with_owner(%s)',
      leftover.args
    );
  end loop;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'create_business_with_owner'
      and p.pronargs = 7
      and pg_get_function_identity_arguments(p.oid) like '%jsonb%'
  ) then
    raise exception 'create_business_with_owner jsonb signature is missing; apply 20261103080000_onboarding_journey.sql first';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'create_business_with_owner'
      and pg_get_function_identity_arguments(p.oid) not like '%jsonb%'
  ) then
    raise exception 'create_business_with_owner still has a leftover overload';
  end if;
end
$$;

revoke all on function public.create_business_with_owner(text, public.business_type, text, text, text, text, jsonb) from public, anon;
grant execute on function public.create_business_with_owner(text, public.business_type, text, text, text, text, jsonb) to authenticated;
