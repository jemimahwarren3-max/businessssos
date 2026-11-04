create or replace function public.list_booking_slots_internal(
  _business_id uuid,
  _service_id uuid,
  _on date,
  _member_id uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  _tz text;
  _dow int;
  _open time;
  _close time;
  _closed boolean;
  _mins int;
  _cursor timestamptz;
  _end timestamptz;
  _slot_end timestamptz;
  _slots jsonb := '[]'::jsonb;
begin
  select duration_minutes into _mins from public.services
    where id = _service_id and business_id = _business_id and deleted_at is null and is_active;
  if _mins is null then
    return '[]'::jsonb;
  end if;
  select coalesce(timezone, 'Africa/Harare') into _tz from public.businesses where id = _business_id;
  _dow := extract(dow from _on);
  if exists (
    select 1 from public.business_closures
    where business_id = _business_id and closed_on = _on
  ) then
    return '[]'::jsonb;
  end if;
  select is_closed, open_time, close_time into _closed, _open, _close
    from public.business_hours
    where business_id = _business_id and weekday = _dow;
  if not found then
    _closed := false;
    _open := '09:00';
    _close := '17:00';
  end if;
  if _member_id is not null then
    if exists (select 1 from public.staff_hours where member_id = _member_id) then
      select is_closed, open_time, close_time into _closed, _open, _close
        from public.staff_hours
        where member_id = _member_id and weekday = _dow;
      if not found then
        _closed := true;
      end if;
    end if;
  end if;
  if _closed then
    return '[]'::jsonb;
  end if;
  _cursor := ((_on::text || ' ' || _open::text)::timestamp at time zone _tz);
  _end := ((_on::text || ' ' || _close::text)::timestamp at time zone _tz);
  while _cursor + make_interval(mins => _mins) <= _end loop
    _slot_end := _cursor + make_interval(mins => _mins);
    if not public.booking_overlaps(_business_id, _member_id, _cursor, _slot_end) then
      _slots := _slots || jsonb_build_array(to_jsonb(_cursor));
    end if;
    _cursor := _cursor + interval '15 minutes';
  end loop;
  return _slots;
end;
$$;

create or replace function public.list_booking_slots(
  _business_id uuid,
  _service_id uuid,
  _on date,
  _member_id uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_business_member(_business_id) then
    raise exception 'Not a member of this business.' using errcode = 'B0013';
  end if;
  return public.list_booking_slots_internal(_business_id, _service_id, _on, _member_id);
end;
$$;

create or replace function public.list_public_booking_slots(
  _slug text,
  _service_id uuid,
  _on date,
  _member_id uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  _business uuid;
begin
  select s.business_id into _business
  from public.storefronts s
  where s.slug = _slug and s.status = 'published';
  if _business is null then
    return '[]'::jsonb;
  end if;
  if not exists (
    select 1 from public.services
    where id = _service_id and business_id = _business and published and is_active and deleted_at is null
  ) then
    return '[]'::jsonb;
  end if;
  return public.list_booking_slots_internal(_business, _service_id, _on, _member_id);
end;
$$;

revoke all on function public.list_booking_slots_internal(uuid, uuid, date, uuid) from public, anon, authenticated;
grant execute on function public.list_booking_slots(uuid, uuid, date, uuid) to authenticated;
revoke all on function public.list_public_booking_slots(text, uuid, date, uuid) from public;
grant execute on function public.list_public_booking_slots(text, uuid, date, uuid) to anon, authenticated;
