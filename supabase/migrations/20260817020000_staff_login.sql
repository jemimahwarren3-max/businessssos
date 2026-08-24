-- Name+password sign-in for staff without an email address. Supabase Auth
-- still requires an email under the hood (generated internally, never sent
-- anywhere — see team.server.ts's createStaffAccount) — this migration only
-- adds what's needed to resolve a business code + name back to that email,
-- and to keep names unique within one business.

alter table public.businesses add column staff_code text unique;
alter table public.business_members add column staff_name text;
create unique index business_members_staff_name_uniq
  on public.business_members(business_id, lower(staff_name)) where staff_name is not null;

-- ============ get_or_create_staff_code ============
create or replace function public.get_or_create_staff_code(_business_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  _code text;
  _alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I/L
  _i int;
begin
  if not public.has_business_role(_business_id, array['owner','admin']::public.app_role[]) then
    raise exception 'You do not have permission to view the staff code.' using errcode = 'B0002';
  end if;

  select staff_code into _code from public.businesses where id = _business_id;
  if _code is not null then
    return _code;
  end if;

  loop
    _code := '';
    for _i in 1..8 loop
      _code := _code || substr(_alphabet, (floor(random() * length(_alphabet)) + 1)::int, 1);
    end loop;
    begin
      update public.businesses set staff_code = _code where id = _business_id;
      exit;
    exception when unique_violation then
      -- collision on the unique constraint — loop and try another code
    end;
  end loop;

  return _code;
end;
$$;
revoke all on function public.get_or_create_staff_code(uuid) from public;
grant execute on function public.get_or_create_staff_code(uuid) to authenticated;

-- ============ resolve_staff_login (anon-callable — deliberately minimal return) ============
create or replace function public.resolve_staff_login(_code text, _name text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  _business_id uuid;
  _email text;
begin
  select id into _business_id from public.businesses where staff_code = _code;
  if _business_id is null then
    return null;
  end if;

  select u.email into _email
  from public.business_members m
  join auth.users u on u.id = m.user_id
  where m.business_id = _business_id
    and m.is_active
    and m.staff_name is not null
    and lower(m.staff_name) = lower(_name);

  return _email;
end;
$$;
revoke all on function public.resolve_staff_login(text, text) from public;
grant execute on function public.resolve_staff_login(text, text) to anon, authenticated;

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
      'team.staff_created', 'team.staff_password_reset'
    )
  );
