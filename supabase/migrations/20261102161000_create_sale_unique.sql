-- Staging re-applies 20261026180000_billing_rpc_enforcement.sql on every run,
-- which CREATE OR REPLACE the 8-arg create_sale. After Stage 2 the live
-- function is 10-arg with defaults; two overloads make 8-arg calls
-- "function is not unique". Drop leftovers after those files run.
-- Do not drop the 10-arg signature.

drop function if exists public.create_sale(uuid, uuid, numeric, public.payment_method, text, jsonb);
drop function if exists public.create_sale(uuid, uuid, numeric, public.payment_method, text, jsonb, text);
drop function if exists public.create_sale(uuid, uuid, numeric, public.payment_method, text, jsonb, text, uuid);
drop function if exists public.create_sale(uuid, uuid, numeric, public.payment_method, text, jsonb, text, uuid, text);

do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'create_sale'
      and p.pronargs = 10
  ) then
    raise exception 'create_sale with _tenders is missing; apply 20261102160000_split_tenders.sql first';
  end if;
end
$$;

grant execute on function public.create_sale(uuid, uuid, numeric, public.payment_method, text, jsonb, text, uuid, text, jsonb) to authenticated;
