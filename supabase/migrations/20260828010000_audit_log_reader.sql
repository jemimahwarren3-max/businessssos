-- audit_logs has been written to since the first migration, but nothing
-- could ever read it back — there was no SELECT policy at all, and no RPC
-- to resolve user_id into an actual name. This adds both, plus a new
-- audit.view permission so it's covered by the existing granular system
-- rather than hardcoded to a fixed role.

insert into public.permissions (key, category, label) values
  ('audit.view', 'Business', 'View the audit log');

-- seed_default_role_permissions only runs once per business (see its own
-- early-return guard) — extending it only covers businesses that haven't
-- been seeded yet. Existing businesses need an explicit backfill below.
create or replace function public.seed_default_role_permissions(_business_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.business_role_permissions where business_id = _business_id) then
    return;
  end if;
  insert into public.business_role_permissions (business_id, role, permission_key)
  select _business_id, d.role, d.permission_key from (values
    ('admin'::public.app_role, 'sales.create'), ('manager'::public.app_role, 'sales.create'), ('cashier'::public.app_role, 'sales.create'),
    ('admin'::public.app_role, 'sales.import'), ('manager'::public.app_role, 'sales.import'), ('accountant'::public.app_role, 'sales.import'),
    ('admin'::public.app_role, 'payments.record'), ('manager'::public.app_role, 'payments.record'), ('cashier'::public.app_role, 'payments.record'), ('accountant'::public.app_role, 'payments.record'),
    ('admin'::public.app_role, 'inventory.import'), ('manager'::public.app_role, 'inventory.import'),
    ('admin'::public.app_role, 'customers.create'), ('manager'::public.app_role, 'customers.create'), ('cashier'::public.app_role, 'customers.create'), ('accountant'::public.app_role, 'customers.create'),
    ('admin'::public.app_role, 'customers.import'), ('manager'::public.app_role, 'customers.import'), ('cashier'::public.app_role, 'customers.import'), ('accountant'::public.app_role, 'customers.import'),
    ('admin'::public.app_role, 'customers.order'), ('manager'::public.app_role, 'customers.order'), ('accountant'::public.app_role, 'customers.order'),
    ('admin'::public.app_role, 'suppliers.view'), ('manager'::public.app_role, 'suppliers.view'),
    ('admin'::public.app_role, 'suppliers.create'), ('manager'::public.app_role, 'suppliers.create'),
    ('admin'::public.app_role, 'suppliers.edit'), ('manager'::public.app_role, 'suppliers.edit'),
    ('admin'::public.app_role, 'suppliers.delete'), ('manager'::public.app_role, 'suppliers.delete'),
    ('admin'::public.app_role, 'purchase_orders.create'), ('manager'::public.app_role, 'purchase_orders.create'),
    ('admin'::public.app_role, 'invoices.manage'), ('manager'::public.app_role, 'invoices.manage'), ('accountant'::public.app_role, 'invoices.manage'),
    ('admin'::public.app_role, 'quotes.manage'), ('manager'::public.app_role, 'quotes.manage'), ('accountant'::public.app_role, 'quotes.manage'),
    ('admin'::public.app_role, 'expenses.create'), ('manager'::public.app_role, 'expenses.create'), ('accountant'::public.app_role, 'expenses.create'),
    ('admin'::public.app_role, 'expenses.delete'),
    ('admin'::public.app_role, 'expenses.import'), ('manager'::public.app_role, 'expenses.import'), ('accountant'::public.app_role, 'expenses.import'),
    ('admin'::public.app_role, 'reports.financial'), ('manager'::public.app_role, 'reports.financial'), ('accountant'::public.app_role, 'reports.financial'),
    ('admin'::public.app_role, 'ai.use'), ('manager'::public.app_role, 'ai.use'), ('accountant'::public.app_role, 'ai.use'),
    ('admin'::public.app_role, 'users.view'),
    ('admin'::public.app_role, 'users.invite'),
    ('admin'::public.app_role, 'users.manage'),
    ('admin'::public.app_role, 'users.remove'),
    ('admin'::public.app_role, 'roles.manage'),
    ('admin'::public.app_role, 'business.settings'),
    ('admin'::public.app_role, 'business.billing'),
    ('admin'::public.app_role, 'business.export_data'),
    ('admin'::public.app_role, 'audit.view')
  ) as d(role, permission_key);
end;
$$;
revoke all on function public.seed_default_role_permissions(uuid) from public;

-- Backfill: give admin audit.view in every business that was already
-- seeded before this migration (the guard above means they'd otherwise
-- never get it). Owner doesn't need a row — has_permission always passes
-- owner regardless of business_role_permissions.
insert into public.business_role_permissions (business_id, role, permission_key)
select distinct brp.business_id, 'admin'::public.app_role, 'audit.view'
from public.business_role_permissions brp
where not exists (
  select 1 from public.business_role_permissions x
  where x.business_id = brp.business_id and x.role = 'admin' and x.permission_key = 'audit.view'
);

-- ============ audit_logs read access ============
-- Found a real, untracked drift here: a "members read audit_logs" policy
-- exists on staging (is_business_member(business_id) — ANY active member,
-- not just owner/admin) that was never created by any migration in this
-- repo, meaning any cashier could already pull the full audit log straight
-- from the API. Dropping it and replacing it with the correctly-scoped
-- version — same defense-in-depth split as everywhere else in this schema:
-- RLS stays on the coarse has_business_role check (owner/admin), while the
-- fine-grained audit.view permission (customizable per business) is
-- enforced at the application layer via assertPermission — see
-- list_audit_logs below and team.server.ts's own comments on this split.
drop policy if exists "members read audit_logs" on public.audit_logs;
create policy "owners and admins read audit logs" on public.audit_logs for select to authenticated
  using (public.has_business_role(business_id, array['owner','admin']::public.app_role[]));

-- ============ list_audit_logs ============
-- Resolves user_id -> a real name the same way list_team_members does
-- (staff_name if set, else the auth user's own full_name/email) — plain
-- audit_logs rows only have a raw UUID, useless on their own in a reader.
-- Fetches _limit+1 rows so the caller can tell if there's another page
-- without a separate count query.
create or replace function public.list_audit_logs(
  _business_id uuid,
  _limit int default 50,
  _offset int default 0
)
returns table(
  id uuid, created_at timestamptz, actor_name text, action text,
  entity_type text, entity_id uuid, summary text, result text
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_business_role(_business_id, array['owner','admin']::public.app_role[]) then
    raise exception 'You do not have permission to view the audit log.' using errcode = 'B0002';
  end if;
  return query
    select
      a.id, a.created_at,
      coalesce(m.staff_name, u.raw_user_meta_data->>'full_name', u.email::text, 'Deleted user'),
      a.action, a.entity_type, a.entity_id, a.summary, a.result
    from public.audit_logs a
    left join auth.users u on u.id = a.user_id
    left join public.business_members m on m.business_id = a.business_id and m.user_id = a.user_id
    where a.business_id = _business_id
    order by a.created_at desc
    limit greatest(_limit, 0) + 1
    offset greatest(_offset, 0);
end;
$$;
revoke all on function public.list_audit_logs(uuid, int, int) from public;
grant execute on function public.list_audit_logs(uuid, int, int) to authenticated;
