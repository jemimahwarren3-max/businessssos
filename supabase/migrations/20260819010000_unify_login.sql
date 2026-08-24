-- Unify sign-in: the business ID + shop password + name + personal password
-- flow (staff-login.tsx) becomes the primary way everyone signs in, owner
-- included, not just staff without an email. That means every member needs
-- a staff_name to show up in the roster. New members get it automatically
-- from their account's full name; existing rows are backfilled the same way.

create or replace function public.create_business_with_owner(
  _name text,
  _business_type public.business_type,
  _currency text,
  _phone text,
  _address text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_business_id uuid;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'You must be signed in to create a business.' using errcode = 'B0002';
  end if;

  insert into public.businesses (
    name, business_type, currency, phone, address, created_by, onboarding_completed
  )
  values (
    _name, _business_type, _currency, nullif(_phone, ''), nullif(_address, ''), v_user_id, true
  )
  returning id into v_business_id;

  insert into public.business_members (business_id, user_id, role, staff_name)
  values (
    v_business_id, v_user_id, 'owner',
    (select raw_user_meta_data->>'full_name' from auth.users where id = v_user_id)
  );

  insert into public.business_settings (business_id) values (v_business_id);

  insert into public.subscriptions (
    business_id, plan, status, trial_ends_at, current_period_start, current_period_end
  )
  values (
    v_business_id, 'pro', 'trialing', now() + interval '3 days', now(), now() + interval '3 days'
  );

  return v_business_id;
end;
$$;
revoke all on function public.create_business_with_owner(text, public.business_type, text, text, text) from public, anon, authenticated;
grant execute on function public.create_business_with_owner(text, public.business_type, text, text, text) to authenticated;

create or replace function public.accept_business_invite(_token text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _invite record;
  _existing_business uuid;
  _full_name text;
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

  select raw_user_meta_data->>'full_name' into _full_name from auth.users where id = auth.uid();

  -- staff_name has a per-business unique index — two invitees sharing a
  -- full name is a real possibility, and a collision here must not block
  -- accepting the invite. Fall back to leaving it unset; they sign in with
  -- email until an admin gives them a distinct name.
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
revoke all on function public.accept_business_invite(text) from public;
grant execute on function public.accept_business_invite(text) to authenticated;

-- Backfill existing members (created before this change) so they show up
-- in the staff-login roster too. Row-by-row with per-row collision handling
-- for the same reason as above — one name clash shouldn't leave the rest
-- of a business unbackfilled.
do $$
declare
  r record;
begin
  for r in
    select m.business_id, m.user_id,
           coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)) as candidate_name
    from public.business_members m
    join auth.users u on u.id = m.user_id
    where m.is_active and m.staff_name is null
  loop
    begin
      update public.business_members
      set staff_name = r.candidate_name
      where business_id = r.business_id and user_id = r.user_id;
    exception when unique_violation then
      null;
    end;
  end loop;
end $$;
