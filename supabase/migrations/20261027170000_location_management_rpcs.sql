-- Owner/admin location management (update, default branch, deactivate).

create or replace function public.update_location(
  _business_id uuid,
  _location_id uuid,
  _name text,
  _address text,
  _phone text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_business_role(_business_id, array['owner','admin']::public.app_role[]) then
    raise exception 'Your role does not allow this action.' using errcode = 'B0002';
  end if;
  if _name is null or length(trim(_name)) = 0 then
    raise exception 'Location name is required.' using errcode = 'B0001';
  end if;
  if not exists (
    select 1 from public.locations l
    where l.id = _location_id and l.business_id = _business_id
  ) then
    raise exception 'Location not found.' using errcode = 'B0001';
  end if;

  update public.locations
  set
    name = trim(_name),
    address = nullif(trim(_address), ''),
    phone = nullif(trim(_phone), '')
  where id = _location_id and business_id = _business_id;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary)
  values (
    _business_id,
    auth.uid(),
    'location.updated',
    'location',
    _location_id,
    'Updated location ' || trim(_name)
  );
end;
$$;
revoke all on function public.update_location(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.update_location(uuid, uuid, text, text, text) to authenticated;

create or replace function public.set_default_location(_business_id uuid, _location_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_business_role(_business_id, array['owner','admin']::public.app_role[]) then
    raise exception 'Your role does not allow this action.' using errcode = 'B0002';
  end if;
  if not exists (
    select 1 from public.locations l
    where l.id = _location_id
      and l.business_id = _business_id
      and l.is_active
  ) then
    raise exception 'Active location not found.' using errcode = 'B0001';
  end if;

  update public.locations set is_default = false where business_id = _business_id;
  update public.locations set is_default = true where id = _location_id and business_id = _business_id;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary)
  values (
    _business_id,
    auth.uid(),
    'location.updated',
    'location',
    _location_id,
    'Set default POS branch'
  );
end;
$$;
revoke all on function public.set_default_location(uuid, uuid) from public, anon;
grant execute on function public.set_default_location(uuid, uuid) to authenticated;

create or replace function public.deactivate_location(_business_id uuid, _location_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _was_default boolean;
begin
  if not public.has_business_role(_business_id, array['owner','admin']::public.app_role[]) then
    raise exception 'Your role does not allow this action.' using errcode = 'B0002';
  end if;

  select l.is_default into _was_default
  from public.locations l
  where l.id = _location_id and l.business_id = _business_id;

  if _was_default is null then
    raise exception 'Location not found.' using errcode = 'B0001';
  end if;
  if _was_default then
    raise exception 'Choose another default branch before deactivating this one.' using errcode = 'B0001';
  end if;

  update public.locations
  set is_active = false, is_default = false
  where id = _location_id and business_id = _business_id;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary)
  values (
    _business_id,
    auth.uid(),
    'location.deactivated',
    'location',
    _location_id,
    'Deactivated location'
  );
end;
$$;
revoke all on function public.deactivate_location(uuid, uuid) from public, anon;
grant execute on function public.deactivate_location(uuid, uuid) to authenticated;
