-- Team invites: lets an owner/admin add teammates to their existing business.
-- The existing business_members INSERT policy only allows an owner/admin to
-- add someone, or the original creator to bootstrap themselves — an invited
-- stranger satisfies neither branch, so accepting needs a security definer
-- RPC to bypass RLS safely (same reasoning as create_sale/import_sale_line).

create table public.business_invites (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  role public.app_role not null,
  token text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_by uuid not null references auth.users(id),
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index business_invites_business_idx on public.business_invites(business_id);
create index business_invites_token_idx on public.business_invites(token);

grant select, insert, update on public.business_invites to authenticated;
grant all on public.business_invites to service_role;

alter table public.business_invites enable row level security;
create policy "admins read invites" on public.business_invites for select to authenticated
  using (public.has_business_role(business_id, array['owner','admin']::public.app_role[]));
create policy "admins create invites" on public.business_invites for insert to authenticated
  with check (
    public.has_business_role(business_id, array['owner','admin']::public.app_role[])
    and created_by = auth.uid()
  );
create policy "admins revoke invites" on public.business_invites for update to authenticated
  using (public.has_business_role(business_id, array['owner','admin']::public.app_role[]))
  with check (public.has_business_role(business_id, array['owner','admin']::public.app_role[]));

-- ============ create_business_invite ============
create or replace function public.create_business_invite(_business_id uuid, _role public.app_role)
returns text
language plpgsql security definer set search_path = public as $$
declare
  _token text;
begin
  if not public.has_business_role(_business_id, array['owner','admin']::public.app_role[]) then
    raise exception 'You do not have permission to invite team members.' using errcode = 'B0002';
  end if;
  _token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.business_invites (business_id, role, token, created_by, expires_at)
  values (_business_id, _role, _token, auth.uid(), now() + interval '7 days');
  return _token;
end;
$$;
revoke all on function public.create_business_invite(uuid, public.app_role) from public;
grant execute on function public.create_business_invite(uuid, public.app_role) to authenticated;

-- ============ get_invite_preview (anon-callable — no business data beyond name/role) ============
create or replace function public.get_invite_preview(_token text)
returns table(business_name text, role public.app_role, valid boolean, reason text)
language plpgsql security definer set search_path = public as $$
declare
  _invite record;
begin
  select i.*, b.name as biz_name into _invite
  from public.business_invites i
  join public.businesses b on b.id = i.business_id
  where i.token = _token;

  if not found then
    return query select null::text, null::public.app_role, false, 'not_found'::text;
    return;
  end if;
  if _invite.status = 'revoked' then
    return query select _invite.biz_name, _invite.role, false, 'revoked'::text;
    return;
  end if;
  if _invite.status = 'accepted' then
    return query select _invite.biz_name, _invite.role, false, 'accepted'::text;
    return;
  end if;
  if _invite.expires_at < now() then
    return query select _invite.biz_name, _invite.role, false, 'expired'::text;
    return;
  end if;
  return query select _invite.biz_name, _invite.role, true, null::text;
end;
$$;
revoke all on function public.get_invite_preview(text) from public;
grant execute on function public.get_invite_preview(text) to anon, authenticated;

-- ============ accept_business_invite ============
create or replace function public.accept_business_invite(_token text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _invite record;
  _existing_business uuid;
begin
  select * into _invite from public.business_invites where token = _token for update;
  if not found then
    raise exception 'This invite link is not valid.' using errcode = 'B0001';
  end if;
  if _invite.status <> 'pending' then
    raise exception 'This invite has already been used or revoked.' using errcode = 'B0001';
  end if;
  if _invite.expires_at < now() then
    raise exception 'This invite has expired.' using errcode = 'B0001';
  end if;

  select business_id into _existing_business from public.business_members
    where user_id = auth.uid() and is_active limit 1;
  if _existing_business is not null and _existing_business <> _invite.business_id then
    raise exception 'Your account already belongs to a business.' using errcode = 'B0001';
  end if;
  -- Re-accepting your own business's invite (e.g. opening an invite link
  -- while already signed in) must never silently overwrite your existing
  -- role — that's a real lockout footgun, not a no-op.
  if _existing_business = _invite.business_id then
    raise exception 'You already belong to this business.' using errcode = 'B0001';
  end if;

  insert into public.business_members (business_id, user_id, role, invited_by)
  values (_invite.business_id, auth.uid(), _invite.role, _invite.created_by)
  on conflict (business_id, user_id) do update set role = excluded.role, is_active = true;

  update public.business_invites set status = 'accepted', accepted_by = auth.uid(), accepted_at = now()
    where id = _invite.id;

  return _invite.business_id;
end;
$$;
revoke all on function public.accept_business_invite(text) from public;
grant execute on function public.accept_business_invite(text) to authenticated;

-- ============ revoke_business_invite ============
create or replace function public.revoke_business_invite(_business_id uuid, _invite_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_business_role(_business_id, array['owner','admin']::public.app_role[]) then
    raise exception 'You do not have permission to manage invites.' using errcode = 'B0002';
  end if;
  update public.business_invites set status = 'revoked'
    where id = _invite_id and business_id = _business_id and status = 'pending';
  if not found then
    raise exception 'That invite could not be found or was already used.' using errcode = 'B0001';
  end if;
end;
$$;
revoke all on function public.revoke_business_invite(uuid, uuid) from public;
grant execute on function public.revoke_business_invite(uuid, uuid) to authenticated;

-- ============ list_team_members (reads auth.users, not otherwise selectable) ============
create or replace function public.list_team_members(_business_id uuid)
returns table(
  id uuid, user_id uuid, role public.app_role, email text, full_name text,
  staff_name text, created_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_business_role(_business_id, array['owner','admin']::public.app_role[]) then
    raise exception 'You do not have permission to view the team.' using errcode = 'B0002';
  end if;
  return query
    select m.id, m.user_id, m.role, u.email::text, coalesce(u.raw_user_meta_data->>'full_name', ''),
      m.staff_name, m.created_at
    from public.business_members m
    join auth.users u on u.id = m.user_id
    where m.business_id = _business_id and m.is_active
    order by m.created_at asc;
end;
$$;
revoke all on function public.list_team_members(uuid) from public;
grant execute on function public.list_team_members(uuid) to authenticated;

-- ============ update_team_member_role (blocks demoting the sole owner) ============
create or replace function public.update_team_member_role(
  _business_id uuid, _member_user_id uuid, _role public.app_role
) returns void
language plpgsql security definer set search_path = public as $$
declare
  _owner_count int;
  _current_role public.app_role;
begin
  if not public.has_business_role(_business_id, array['owner','admin']::public.app_role[]) then
    raise exception 'You do not have permission to change roles.' using errcode = 'B0002';
  end if;
  select role into _current_role from public.business_members
    where business_id = _business_id and user_id = _member_user_id and is_active;
  if not found then
    raise exception 'That team member could not be found.' using errcode = 'B0001';
  end if;
  if _current_role = 'owner' and _role <> 'owner' then
    select count(*) into _owner_count from public.business_members
      where business_id = _business_id and role = 'owner' and is_active;
    if _owner_count <= 1 then
      raise exception 'A business must have at least one owner.' using errcode = 'B0001';
    end if;
  end if;
  update public.business_members set role = _role
    where business_id = _business_id and user_id = _member_user_id;
end;
$$;
revoke all on function public.update_team_member_role(uuid, uuid, public.app_role) from public;
grant execute on function public.update_team_member_role(uuid, uuid, public.app_role) to authenticated;

-- ============ remove_team_member (blocks self-removal and removing the sole owner) ============
create or replace function public.remove_team_member(_business_id uuid, _member_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  _owner_count int;
  _current_role public.app_role;
begin
  if not public.has_business_role(_business_id, array['owner','admin']::public.app_role[]) then
    raise exception 'You do not have permission to remove team members.' using errcode = 'B0002';
  end if;
  if _member_user_id = auth.uid() then
    raise exception 'You cannot remove yourself. Use account deletion instead.' using errcode = 'B0001';
  end if;
  select role into _current_role from public.business_members
    where business_id = _business_id and user_id = _member_user_id and is_active;
  if not found then
    raise exception 'That team member could not be found.' using errcode = 'B0001';
  end if;
  if _current_role = 'owner' then
    select count(*) into _owner_count from public.business_members
      where business_id = _business_id and role = 'owner' and is_active;
    if _owner_count <= 1 then
      raise exception 'A business must have at least one owner.' using errcode = 'B0001';
    end if;
  end if;
  update public.business_members set is_active = false
    where business_id = _business_id and user_id = _member_user_id;
end;
$$;
revoke all on function public.remove_team_member(uuid, uuid) from public;
grant execute on function public.remove_team_member(uuid, uuid) to authenticated;

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
      'team.invited', 'team.invite_revoked', 'team.role_changed', 'team.member_removed'
    )
  );
