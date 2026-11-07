drop policy if exists "owners create invites" on public.business_invites;
drop policy if exists "owners read invites" on public.business_invites;
drop policy if exists "owners update invites" on public.business_invites;
drop policy if exists "owners and admins update lower roles" on public.business_members;
drop policy if exists "owners add team members" on public.business_members;
drop policy if exists "owners and admins remove lower roles" on public.business_members;
drop policy if exists "owners and admins write lower-role permissions" on public.business_role_permissions;
drop policy if exists "owners and admins delete lower-role permissions" on public.business_role_permissions;
drop policy if exists "admins create invites" on public.business_invites;
create policy "owners create invites" on public.business_invites for insert to authenticated
  with check (
    public.has_business_role(business_id, array['owner']::public.app_role[])
    and role <> 'owner'
    and created_by = auth.uid()
  );

drop policy if exists "admins read invites" on public.business_invites;
create policy "owners read invites" on public.business_invites for select to authenticated
  using (public.has_business_role(business_id, array['owner']::public.app_role[]));

drop policy if exists "admins revoke invites" on public.business_invites;
create policy "owners update invites" on public.business_invites for update to authenticated
  using (public.has_business_role(business_id, array['owner']::public.app_role[]))
  with check (public.has_business_role(business_id, array['owner']::public.app_role[]));

revoke update, delete on public.business_members from authenticated;

drop policy if exists "admins update member" on public.business_members;
create policy "owners and admins update lower roles" on public.business_members for update to authenticated
  using (
    public.has_business_role(business_id, array['owner']::public.app_role[])
    or (
      public.has_business_role(business_id, array['admin']::public.app_role[])
      and role not in ('owner', 'admin')
    )
  )
  with check (
    public.has_business_role(business_id, array['owner']::public.app_role[])
    or (
      public.has_business_role(business_id, array['admin']::public.app_role[])
      and role not in ('owner', 'admin')
    )
  );

drop policy if exists "bootstrap or admin add member" on public.business_members;
create policy "owners add team members" on public.business_members for insert to authenticated
  with check (
    public.has_business_role(business_id, array['owner']::public.app_role[])
    or (
      user_id = auth.uid()
      and role = 'owner'
      and exists (
        select 1 from public.businesses b
        where b.id = business_id and b.created_by = auth.uid()
      )
    )
  );

drop policy if exists "admins remove member" on public.business_members;
create policy "owners and admins remove lower roles" on public.business_members for delete to authenticated
  using (
    public.has_business_role(business_id, array['owner']::public.app_role[])
    or (
      public.has_business_role(business_id, array['admin']::public.app_role[])
      and role not in ('owner', 'admin')
    )
  );

drop policy if exists "admins write role permissions" on public.business_role_permissions;
create policy "owners and admins write lower-role permissions" on public.business_role_permissions for insert to authenticated
  with check (
    public.has_business_role(business_id, array['owner']::public.app_role[])
    or (
      public.has_business_role(business_id, array['admin']::public.app_role[])
      and role not in ('owner', 'admin')
    )
  );

drop policy if exists "admins delete role permissions" on public.business_role_permissions;
create policy "owners and admins delete lower-role permissions" on public.business_role_permissions for delete to authenticated
  using (
    public.has_business_role(business_id, array['owner']::public.app_role[])
    or (
      public.has_business_role(business_id, array['admin']::public.app_role[])
      and role not in ('owner', 'admin')
    )
  );

create or replace function public.create_business_invite(_business_id uuid, _role public.app_role)
returns text
language plpgsql security definer set search_path = public as $$
declare
  _token text;
begin
  if not public.has_business_role(_business_id, array['owner']::public.app_role[]) then
    raise exception 'Only an owner can invite team members.' using errcode = 'B0002';
  end if;
  if _role = 'owner' then
    raise exception 'Owner accounts cannot be created through an invite.' using errcode = 'B0001';
  end if;
  _token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.business_invites (business_id, role, token, created_by, expires_at)
  values (_business_id, _role, _token, auth.uid(), now() + interval '7 days');
  return _token;
end;
$$;
revoke all on function public.create_business_invite(uuid, public.app_role) from public, anon;
grant execute on function public.create_business_invite(uuid, public.app_role) to authenticated;

create or replace function public.revoke_business_invite(_business_id uuid, _invite_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_business_role(_business_id, array['owner']::public.app_role[]) then
    raise exception 'Only an owner can manage team invites.' using errcode = 'B0002';
  end if;
  update public.business_invites set status = 'revoked'
    where id = _invite_id and business_id = _business_id and status = 'pending';
  if not found then
    raise exception 'That invite could not be found or was already used.' using errcode = 'B0001';
  end if;
end;
$$;
revoke all on function public.revoke_business_invite(uuid, uuid) from public, anon;
grant execute on function public.revoke_business_invite(uuid, uuid) to authenticated;

create or replace function public.update_team_member_role(
  _business_id uuid, _member_user_id uuid, _role public.app_role
) returns void
language plpgsql security definer set search_path = public as $$
declare
  _owner_count int;
  _current_role public.app_role;
  _caller_is_owner boolean;
begin
  perform 1 from public.businesses where id = _business_id for update;
  if not found then
    raise exception 'That business could not be found.' using errcode = 'B0001';
  end if;
  _caller_is_owner := public.has_business_role(_business_id, array['owner']::public.app_role[]);
  if not _caller_is_owner and not public.has_business_role(_business_id, array['admin']::public.app_role[]) then
    raise exception 'You do not have permission to change roles.' using errcode = 'B0002';
  end if;
  select role into _current_role from public.business_members
    where business_id = _business_id and user_id = _member_user_id and is_active;
  if not found then
    raise exception 'That team member could not be found.' using errcode = 'B0001';
  end if;
  if not _caller_is_owner and (
    _current_role in ('owner', 'admin') or _role in ('owner', 'admin')
  ) then
    raise exception 'Only an owner can manage owner or admin accounts.' using errcode = 'B0002';
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
revoke all on function public.update_team_member_role(uuid, uuid, public.app_role) from public, anon;
grant execute on function public.update_team_member_role(uuid, uuid, public.app_role) to authenticated;

create or replace function public.remove_team_member(_business_id uuid, _member_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  _owner_count int;
  _current_role public.app_role;
  _caller_is_owner boolean;
begin
  perform 1 from public.businesses where id = _business_id for update;
  if not found then
    raise exception 'That business could not be found.' using errcode = 'B0001';
  end if;
  _caller_is_owner := public.has_business_role(_business_id, array['owner']::public.app_role[]);
  if not _caller_is_owner and not public.has_business_role(_business_id, array['admin']::public.app_role[]) then
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
  if not _caller_is_owner and _current_role in ('owner', 'admin') then
    raise exception 'Only an owner can manage owner or admin accounts.' using errcode = 'B0002';
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
revoke all on function public.remove_team_member(uuid, uuid) from public, anon;
grant execute on function public.remove_team_member(uuid, uuid) to authenticated;

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
  if _role = 'admin'
     and not public.has_business_role(_business_id, array['owner']::public.app_role[]) then
    raise exception 'Only an owner can manage admin permissions.' using errcode = 'B0002';
  end if;
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
revoke all on function public.set_role_permission(uuid, public.app_role, text, boolean) from public, anon;
grant execute on function public.set_role_permission(uuid, public.app_role, text, boolean) to authenticated;