-- Medium audit follow-ups: staff login email never leaves the database
-- (M1), invite tokens stored as sha256 (M5). No new vendors.

create or replace function public.resolve_staff_login(_business_name text, _staff_name text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  _business_id uuid;
  _email text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Not allowed.' using errcode = 'B0002';
  end if;

  select id into _business_id from public.businesses where lower(trim(name)) = lower(trim(_business_name));
  if _business_id is null then
    return null;
  end if;

  select u.email into _email
  from public.business_members m
  join auth.users u on u.id = m.user_id
  where m.business_id = _business_id
    and m.is_active
    and m.staff_name is not null
    and lower(m.staff_name) = lower(_staff_name);

  return _email;
end;
$$;
revoke all on function public.resolve_staff_login(text, text) from public, anon, authenticated;
grant execute on function public.resolve_staff_login(text, text) to service_role;

alter table public.business_invites add column if not exists token_hash text;

update public.business_invites
  set token_hash = encode(extensions.digest(convert_to(token, 'UTF8'), 'sha256'), 'hex')
  where token_hash is null and token is not null;

delete from public.business_invites where token_hash is null;

alter table public.business_invites alter column token_hash set not null;
create unique index if not exists business_invites_token_hash_idx on public.business_invites(token_hash);

alter table public.business_invites drop constraint if exists business_invites_token_key;
drop index if exists business_invites_token_idx;
alter table public.business_invites drop column if exists token;

create or replace function public.create_business_invite(_business_id uuid, _role public.app_role)
returns text
language plpgsql security definer set search_path = public as $$
declare
  _token text;
begin
  if not public.has_business_role(_business_id, array['owner','admin']::public.app_role[]) then
    raise exception 'You do not have permission to invite team members.' using errcode = 'B0002';
  end if;
  if _role = 'owner' then
    raise exception 'You cannot invite someone as owner.' using errcode = 'B0002';
  end if;
  _token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.business_invites (business_id, role, token_hash, created_by, expires_at)
  values (
    _business_id,
    _role,
    encode(extensions.digest(convert_to(_token, 'UTF8'), 'sha256'), 'hex'),
    auth.uid(),
    now() + interval '7 days'
  );
  return _token;
end;
$$;
revoke all on function public.create_business_invite(uuid, public.app_role) from public, anon;
grant execute on function public.create_business_invite(uuid, public.app_role) to authenticated;

create or replace function public.get_invite_preview(_token text)
returns table(business_name text, role public.app_role, valid boolean, reason text)
language plpgsql security definer set search_path = public as $$
declare
  _invite record;
  _hash text;
begin
  _hash := encode(extensions.digest(convert_to(_token, 'UTF8'), 'sha256'), 'hex');
  select i.*, b.name as biz_name into _invite
  from public.business_invites i
  join public.businesses b on b.id = i.business_id
  where i.token_hash = _hash;

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

create or replace function public.accept_business_invite(_token text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _invite record;
  _existing_business uuid;
  _full_name text;
  _hash text;
begin
  _hash := encode(extensions.digest(convert_to(_token, 'UTF8'), 'sha256'), 'hex');
  select * into _invite from public.business_invites where token_hash = _hash for update;
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
  if _existing_business = _invite.business_id then
    raise exception 'You already belong to this business.' using errcode = 'B0001';
  end if;

  select raw_user_meta_data->>'full_name' into _full_name from auth.users where id = auth.uid();

  begin
    insert into public.business_members (business_id, user_id, role, invited_by, staff_name)
    values (_invite.business_id, auth.uid(), _invite.role, _invite.created_by, _full_name)
    on conflict (business_id, user_id) do update set role = excluded.role, is_active = true;
  exception when unique_violation then
    insert into public.business_members (business_id, user_id, role, invited_by)
    values (_invite.business_id, auth.uid(), _invite.role, _invite.created_by)
    on conflict (business_id, user_id) do update set role = excluded.role, is_active = true;
  end;

  update public.business_invites set status = 'accepted', accepted_by = auth.uid(), accepted_at = now()
    where id = _invite.id;

  return _invite.business_id;
end;
$$;
revoke all on function public.accept_business_invite(text) from public, anon;
grant execute on function public.accept_business_invite(text) to authenticated;
