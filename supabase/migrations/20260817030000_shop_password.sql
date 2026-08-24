-- Two-step staff sign-in: a real shop password gates seeing the staff
-- roster at all, then each person still signs in with their own password
-- (via the existing resolve_staff_login/signIn path, unchanged). pgcrypto
-- is already enabled on this project, so the hash is checked entirely
-- inside Postgres — it never has to leave the database layer.

alter table public.businesses add column staff_password_hash text;

-- ============ set_staff_password ============
create or replace function public.set_staff_password(_business_id uuid, _password text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_business_role(_business_id, array['owner','admin']::public.app_role[]) then
    raise exception 'You do not have permission to set the shop password.' using errcode = 'B0002';
  end if;
  if _password is null or length(_password) < 8 then
    raise exception 'Password must be at least 8 characters.' using errcode = 'B0001';
  end if;
  update public.businesses set staff_password_hash = extensions.crypt(_password, extensions.gen_salt('bf'))
    where id = _business_id;
end;
$$;
revoke all on function public.set_staff_password(uuid, text) from public;
grant execute on function public.set_staff_password(uuid, text) to authenticated;

-- ============ verify_shop_login (anon-callable) ============
-- Deliberately a single call that both checks the password AND returns the
-- roster — a separate anon-callable "list names" RPC would let anyone who
-- merely knows the semi-public business code skip the password check.
create or replace function public.verify_shop_login(_code text, _password text)
returns table(valid boolean, business_id uuid, business_name text, staff_names text[])
language plpgsql security definer set search_path = public as $$
declare
  _biz record;
begin
  select id, name, staff_password_hash into _biz from public.businesses where staff_code = _code;
  if _biz.id is null or _biz.staff_password_hash is null
     or _biz.staff_password_hash <> extensions.crypt(_password, _biz.staff_password_hash) then
    return query select false, null::uuid, null::text, null::text[];
    return;
  end if;

  return query
    select true, _biz.id, _biz.name,
      coalesce(
        (select array_agg(m.staff_name order by m.staff_name)
         from public.business_members m
         where m.business_id = _biz.id and m.is_active and m.staff_name is not null),
        array[]::text[]
      );
end;
$$;
revoke all on function public.verify_shop_login(text, text) from public;
grant execute on function public.verify_shop_login(text, text) to anon, authenticated;

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
      'team.staff_created', 'team.staff_password_reset', 'team.shop_password_set'
    )
  );
