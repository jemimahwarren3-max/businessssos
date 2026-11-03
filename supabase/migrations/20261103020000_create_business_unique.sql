-- Staging still has the old 7-arg create_business_with_owner (timezone/tax_mode)
-- beside the current 5-arg function. Five-arg calls then fail with
-- "function is not unique", so Create shop and master CI never finish, and
-- deploy of shop-load fixes never runs. Drop leftovers by identity so the
-- types match whatever Postgres actually stored.

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
      and p.pronargs <> 5
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
      and p.pronargs = 5
  ) then
    raise exception 'create_business_with_owner 5-arg is missing; apply 20261031163000_create_business_idempotent.sql first';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'create_business_with_owner'
      and p.pronargs <> 5
  ) then
    raise exception 'create_business_with_owner still has a leftover overload';
  end if;
end
$$;

revoke all on function public.create_business_with_owner(text, public.business_type, text, text, text) from public, anon;
grant execute on function public.create_business_with_owner(text, public.business_type, text, text, text) to authenticated;
