-- Platform owner identity and subscription entitlement.
-- Invite the owner through Supabase Auth first, then run the one-time
-- bootstrap function from the Supabase SQL editor using the invited email.

create table if not exists public.platform_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('super_admin', 'admin', 'support')),
  granted_by uuid references auth.users(id) on delete set null,
  reason text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (user_id, role, created_at)
);

create unique index if not exists platform_roles_one_active_super_admin
  on public.platform_roles (role)
  where role = 'super_admin' and revoked_at is null;

create index if not exists platform_roles_active_user_idx
  on public.platform_roles (user_id, role)
  where revoked_at is null;

alter table public.platform_roles enable row level security;
revoke all on public.platform_roles from public, anon, authenticated;
grant select, insert, update on public.platform_roles to service_role;

create table if not exists public.platform_entitlements (
  user_id uuid not null references auth.users(id) on delete cascade,
  entitlement text not null check (entitlement in ('owner_subscription_bypass')),
  granted_by uuid references auth.users(id) on delete set null,
  reason text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (user_id, entitlement, created_at)
);

create unique index if not exists platform_entitlements_one_active_per_user
  on public.platform_entitlements (user_id, entitlement)
  where revoked_at is null;

alter table public.platform_entitlements enable row level security;
revoke all on public.platform_entitlements from public, anon, authenticated;
grant select, insert, update on public.platform_entitlements to service_role;

create table if not exists public.platform_admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  subject_user_id uuid,
  action text not null,
  reason text not null,
  outcome text not null check (outcome in ('success', 'failure')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.platform_admin_audit enable row level security;
revoke all on public.platform_admin_audit from public, anon, authenticated;
grant select, insert on public.platform_admin_audit to service_role;

create or replace function public.prevent_platform_admin_audit_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Platform administrator audit records are immutable.';
end;
$$;

drop trigger if exists platform_admin_audit_immutable on public.platform_admin_audit;
create trigger platform_admin_audit_immutable
  before update or delete on public.platform_admin_audit
  for each row execute function public.prevent_platform_admin_audit_mutation();

create or replace function public.bootstrap_platform_owner(_owner_email text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_owner_id uuid;
begin
  if _owner_email is null or length(trim(_owner_email)) < 6 then
    raise exception 'A valid invited owner email is required.';
  end if;

  if exists (
    select 1 from public.platform_roles
    where role = 'super_admin' and revoked_at is null
  ) then
    raise exception 'A platform owner is already configured.';
  end if;

  select id into v_owner_id
  from auth.users
  where lower(email) = lower(trim(_owner_email))
    and email_confirmed_at is not null;

  if v_owner_id is null then
    raise exception 'No email-confirmed Auth account exists for that address. Invite and verify it first.';
  end if;

  insert into public.platform_roles (user_id, role, reason)
  values (v_owner_id, 'super_admin', 'Initial platform owner bootstrap');

  insert into public.platform_entitlements (user_id, entitlement, reason)
  values (v_owner_id, 'owner_subscription_bypass', 'Platform owner entitlement');

  insert into public.platform_admin_audit (
    subject_user_id, action, reason, outcome, detail
  )
  values (
    v_owner_id,
    'bootstrap_platform_owner',
    'Initial platform owner provisioned after verified Supabase Auth invitation',
    'success',
    '{}'::jsonb
  );

  return v_owner_id;
end;
$$;
revoke all on function public.bootstrap_platform_owner(text) from public, anon, authenticated;
grant execute on function public.bootstrap_platform_owner(text) to service_role;

create or replace function public.platform_admin_access(_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'is_super_admin', exists (
      select 1 from public.platform_roles
      where user_id = _user_id and role = 'super_admin' and revoked_at is null
    ),
    'bootstrap_complete', exists (
      select 1 from public.platform_roles
      where role = 'super_admin' and revoked_at is null
    )
  );
$$;
revoke all on function public.platform_admin_access(uuid) from public, anon, authenticated;
grant execute on function public.platform_admin_access(uuid) to service_role;

create or replace function public.has_platform_subscription_bypass()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.platform_roles r
    join public.platform_entitlements e on e.user_id = r.user_id
    where r.user_id = auth.uid()
      and r.role = 'super_admin'
      and r.revoked_at is null
      and e.entitlement = 'owner_subscription_bypass'
      and e.revoked_at is null
  );
$$;
revoke all on function public.has_platform_subscription_bypass() from public, anon;
grant execute on function public.has_platform_subscription_bypass() to authenticated, service_role;

comment on table public.platform_roles is
  'Server-managed platform roles. Authenticated users have no direct table access; provision via controlled service operations.';
comment on table public.platform_entitlements is
  'Server-managed non-billing entitlements. Owner subscription bypass never changes subscription or payment records.';
