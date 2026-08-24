-- Replaces 18 hardcoded role arrays (29 server call sites + 18 client-side
-- copies, audited via grep across the whole codebase) with a real
-- role -> permissions model. Default grants below reproduce today's exact
-- behavior — this is a mechanism change, not a re-decision of who can do
-- what. Owner is intentionally not represented in business_role_permissions
-- at all — has_permission() always returns true for owner, and
-- set_role_permission() refuses role='owner' outright, so it can never be
-- restricted by anyone, including itself (the same class of lockout bug
-- fixed earlier this session for invite acceptance).

create table public.permissions (
  key text primary key,
  category text not null,
  label text not null
);

insert into public.permissions (key, category, label) values
  ('sales.create', 'Sales', 'Create sales'),
  ('sales.import', 'Sales', 'Import sales'),
  ('payments.record', 'Sales', 'Record invoice payments'),
  ('inventory.import', 'Inventory', 'Import products'),
  ('customers.create', 'Customers', 'Add customers'),
  ('customers.import', 'Customers', 'Import customers'),
  ('customers.order', 'Customers', 'Order for a customer (WhatsApp)'),
  ('suppliers.view', 'Suppliers', 'View suppliers'),
  ('suppliers.create', 'Suppliers', 'Add suppliers'),
  ('suppliers.edit', 'Suppliers', 'Edit suppliers'),
  ('suppliers.delete', 'Suppliers', 'Delete suppliers'),
  ('purchase_orders.create', 'Suppliers', 'Create purchase orders'),
  ('invoices.manage', 'Finance', 'Create and manage invoices'),
  ('quotes.manage', 'Finance', 'Create and manage quotes'),
  ('expenses.create', 'Finance', 'Record expenses'),
  ('expenses.delete', 'Finance', 'Delete expenses'),
  ('expenses.import', 'Finance', 'Import expenses'),
  ('reports.financial', 'Finance', 'View reports & insights'),
  ('ai.use', 'AI', 'Use AI Assistant & Quick Add'),
  ('users.view', 'Team', 'View the team'),
  ('users.invite', 'Team', 'Invite or add team members'),
  ('users.manage', 'Team', 'Manage team member accounts (e.g. reset a password)'),
  ('users.remove', 'Team', 'Remove team members'),
  ('roles.manage', 'Team', 'Change a team member''s role'),
  ('business.settings', 'Business', 'Change business/shop settings'),
  ('business.billing', 'Business', 'Manage billing'),
  ('business.export_data', 'Business', 'Export all business data');

grant select on public.permissions to authenticated;

create table public.business_role_permissions (
  business_id uuid not null references public.businesses(id) on delete cascade,
  role public.app_role not null,
  permission_key text not null references public.permissions(key),
  primary key (business_id, role, permission_key)
);
create index business_role_permissions_business_idx on public.business_role_permissions(business_id);

grant select, insert, delete on public.business_role_permissions to authenticated;
grant all on public.business_role_permissions to service_role;

alter table public.business_role_permissions enable row level security;
create policy "admins read role permissions" on public.business_role_permissions for select to authenticated
  using (public.has_business_role(business_id, array['owner','admin']::public.app_role[]));
create policy "admins write role permissions" on public.business_role_permissions for insert to authenticated
  with check (public.has_business_role(business_id, array['owner','admin']::public.app_role[]) and role <> 'owner');
create policy "admins delete role permissions" on public.business_role_permissions for delete to authenticated
  using (public.has_business_role(business_id, array['owner','admin']::public.app_role[]) and role <> 'owner');

-- ============ get_or_create_role_permissions ============
-- Lazily seeds default grants on first access, same pattern as
-- get_or_create_staff_code — no backfill migration needed for existing
-- businesses. Defaults below mirror every existing hardcoded role array
-- exactly (see the migration's own comment above and the accompanying PR
-- description for the full audit this was derived from). Not exposed
-- directly — no permission check of its own, both get_or_create_role_
-- permissions (admin-only, full matrix) and get_my_permissions (any member,
-- own role only) call it so the seed data is defined exactly once.
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
    ('admin'::public.app_role, 'business.export_data')
  ) as d(role, permission_key);
end;
$$;
revoke all on function public.seed_default_role_permissions(uuid) from public;

create or replace function public.get_or_create_role_permissions(_business_id uuid)
returns table(role public.app_role, permission_key text)
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_business_role(_business_id, array['owner','admin']::public.app_role[]) then
    raise exception 'You do not have permission to view role permissions.' using errcode = 'B0002';
  end if;
  perform public.seed_default_role_permissions(_business_id);
  return query
    select p.role, p.permission_key from public.business_role_permissions p where p.business_id = _business_id;
end;
$$;
revoke all on function public.get_or_create_role_permissions(uuid) from public;
grant execute on function public.get_or_create_role_permissions(uuid) to authenticated;

-- ============ get_my_permissions ============
-- Unlike get_or_create_role_permissions above (admin-only, full matrix),
-- this is for any business member to learn their own effective permission
-- set — loadWorkspace calls this for every login, regardless of role.
create or replace function public.get_my_permissions(_business_id uuid)
returns text[]
language plpgsql security definer set search_path = public as $$
declare
  _role public.app_role;
begin
  select m.role into _role from public.business_members m
    where m.business_id = _business_id and m.user_id = auth.uid() and m.is_active;
  if _role is null then
    raise exception 'You do not have access to this business.' using errcode = 'B0002';
  end if;
  if _role = 'owner' then
    return (select coalesce(array_agg(key), array[]::text[]) from public.permissions);
  end if;
  perform public.seed_default_role_permissions(_business_id);
  return (
    select coalesce(array_agg(permission_key), array[]::text[])
    from public.business_role_permissions
    where business_id = _business_id and role = _role
  );
end;
$$;
revoke all on function public.get_my_permissions(uuid) from public;
grant execute on function public.get_my_permissions(uuid) to authenticated;

-- ============ has_permission ============
create or replace function public.has_permission(_business_id uuid, _permission text)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  _role public.app_role;
begin
  select m.role into _role from public.business_members m
    where m.business_id = _business_id and m.user_id = auth.uid() and m.is_active;
  if _role is null then
    return false;
  end if;
  if _role = 'owner' then
    return true;
  end if;
  return exists (
    select 1 from public.business_role_permissions
    where business_id = _business_id and role = _role and permission_key = _permission
  );
end;
$$;
revoke all on function public.has_permission(uuid, text) from public;
grant execute on function public.has_permission(uuid, text) to authenticated, service_role;

-- ============ set_role_permission ============
create or replace function public.set_role_permission(
  _business_id uuid, _role public.app_role, _permission_key text, _granted boolean
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_business_role(_business_id, array['owner','admin']::public.app_role[]) then
    raise exception 'You do not have permission to change role permissions.' using errcode = 'B0002';
  end if;
  if _role = 'owner' then
    raise exception 'The owner role always has full access and cannot be changed.' using errcode = 'B0001';
  end if;
  -- Seed defaults first if this is the first change made for this business,
  -- so a lone insert/delete never leaves the row set half-seeded.
  perform public.seed_default_role_permissions(_business_id);

  if _granted then
    insert into public.business_role_permissions (business_id, role, permission_key)
    values (_business_id, _role, _permission_key)
    on conflict (business_id, role, permission_key) do nothing;
  else
    delete from public.business_role_permissions
      where business_id = _business_id and role = _role and permission_key = _permission_key;
  end if;
end;
$$;
revoke all on function public.set_role_permission(uuid, public.app_role, text, boolean) from public;
grant execute on function public.set_role_permission(uuid, public.app_role, text, boolean) to authenticated;

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
      'team.staff_created', 'team.staff_password_reset', 'team.shop_password_set',
      'team.permission_changed'
    )
  );
