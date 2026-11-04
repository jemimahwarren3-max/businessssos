-- Service CRUD, bookings, public requests, reports, and POS service lines.

create or replace function public.booking_overlaps(
  _business_id uuid,
  _member_id uuid,
  _starts timestamptz,
  _ends timestamptz,
  _ignore uuid default null
) returns boolean
language sql stable set search_path = public as $$
  select exists (
    select 1 from public.service_bookings b
    where b.business_id = _business_id
      and b.status not in ('cancelled', 'no_show')
      and (_ignore is null or b.id <> _ignore)
      and b.starts_at < _ends
      and b.ends_at > _starts
      and (
        (_member_id is not null and b.member_id = _member_id)
        or (_member_id is null and b.member_id is null)
      )
  );
$$;

-- ============ SERVICE CRUD ============

create or replace function public.list_services(_business_id uuid, _include_archived boolean default false)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_business_member(_business_id) then
    raise exception 'Not a member of this business.' using errcode = 'B0013';
  end if;
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.name)
    from (
      select
        s.id,
        s.name,
        s.description,
        s.category_id as "categoryId",
        c.name as "categoryName",
        s.price,
        s.duration_minutes as "durationMinutes",
        s.image_url as "imageUrl",
        s.pricing_type as "pricingType",
        s.requires_booking as "requiresBooking",
        s.published,
        s.is_active as "isActive",
        s.deleted_at as "deletedAt",
        coalesce((
          select jsonb_agg(ss.member_id)
          from public.service_staff ss where ss.service_id = s.id
        ), '[]'::jsonb) as "staffMemberIds"
      from public.services s
      left join public.categories c on c.id = s.category_id
      where s.business_id = _business_id
        and (_include_archived or s.deleted_at is null)
    ) x
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_services(uuid, boolean) from public, anon;
grant execute on function public.list_services(uuid, boolean) to authenticated;

create or replace function public.create_service(
  _business_id uuid,
  _name text,
  _description text,
  _category_id uuid,
  _price numeric,
  _duration_minutes int,
  _pricing_type text,
  _requires_booking boolean,
  _published boolean,
  _staff_member_ids uuid[]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _id uuid;
  _member uuid;
begin
  if not public.has_permission(_business_id, 'services.manage') then
    raise exception 'You do not have permission to manage services.' using errcode = 'B0002';
  end if;
  if length(btrim(coalesce(_name, ''))) < 1 then
    raise exception 'Service name is required.' using errcode = 'B0001';
  end if;
  insert into public.services (
    business_id, name, description, category_id, price, duration_minutes,
    pricing_type, requires_booking, published, is_active
  ) values (
    _business_id, btrim(_name), nullif(btrim(coalesce(_description, '')), ''),
    _category_id, coalesce(_price, 0), coalesce(_duration_minutes, 60),
    coalesce(_pricing_type, 'fixed'), coalesce(_requires_booking, true),
    coalesce(_published, false), true
  ) returning id into _id;
  if _staff_member_ids is not null then
    foreach _member in array _staff_member_ids
    loop
      if exists (select 1 from public.business_members where id = _member and business_id = _business_id) then
        insert into public.service_staff (service_id, member_id) values (_id, _member)
        on conflict do nothing;
      end if;
    end loop;
  end if;
  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary)
  values (_business_id, auth.uid(), 'service.created', 'service', _id, 'Created service ' || btrim(_name));
  return _id;
end;
$$;

revoke all on function public.create_service(uuid, text, text, uuid, numeric, int, text, boolean, boolean, uuid[]) from public, anon;
grant execute on function public.create_service(uuid, text, text, uuid, numeric, int, text, boolean, boolean, uuid[]) to authenticated;

create or replace function public.update_service(
  _business_id uuid,
  _service_id uuid,
  _name text,
  _description text,
  _category_id uuid,
  _price numeric,
  _duration_minutes int,
  _pricing_type text,
  _requires_booking boolean,
  _published boolean,
  _is_active boolean,
  _staff_member_ids uuid[]
) returns void
language plpgsql security definer set search_path = public as $$
declare
  _member uuid;
begin
  if not public.has_permission(_business_id, 'services.manage') then
    raise exception 'You do not have permission to manage services.' using errcode = 'B0002';
  end if;
  update public.services set
    name = btrim(_name),
    description = nullif(btrim(coalesce(_description, '')), ''),
    category_id = _category_id,
    price = coalesce(_price, 0),
    duration_minutes = coalesce(_duration_minutes, 60),
    pricing_type = coalesce(_pricing_type, 'fixed'),
    requires_booking = coalesce(_requires_booking, true),
    published = coalesce(_published, false),
    is_active = coalesce(_is_active, true),
    updated_at = now()
  where id = _service_id and business_id = _business_id and deleted_at is null;
  if not found then
    raise exception 'That service could not be found.' using errcode = 'B0001';
  end if;
  delete from public.service_staff where service_id = _service_id;
  if _staff_member_ids is not null then
    foreach _member in array _staff_member_ids
    loop
      if exists (select 1 from public.business_members where id = _member and business_id = _business_id) then
        insert into public.service_staff (service_id, member_id) values (_service_id, _member)
        on conflict do nothing;
      end if;
    end loop;
  end if;
end;
$$;

revoke all on function public.update_service(uuid, uuid, text, text, uuid, numeric, int, text, boolean, boolean, boolean, uuid[]) from public, anon;
grant execute on function public.update_service(uuid, uuid, text, text, uuid, numeric, int, text, boolean, boolean, boolean, uuid[]) to authenticated;

create or replace function public.archive_service(_business_id uuid, _service_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission(_business_id, 'services.manage') then
    raise exception 'You do not have permission to manage services.' using errcode = 'B0002';
  end if;
  update public.services
    set deleted_at = now(), published = false, is_active = false, updated_at = now()
    where id = _service_id and business_id = _business_id and deleted_at is null;
  if not found then
    raise exception 'That service could not be found.' using errcode = 'B0001';
  end if;
end;
$$;

revoke all on function public.archive_service(uuid, uuid) from public, anon;
grant execute on function public.archive_service(uuid, uuid) to authenticated;

create or replace function public.set_service_image(_business_id uuid, _service_id uuid, _image_url text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission(_business_id, 'services.manage') then
    raise exception 'You do not have permission to manage services.' using errcode = 'B0002';
  end if;
  update public.services set image_url = _image_url, updated_at = now()
    where id = _service_id and business_id = _business_id and deleted_at is null;
  if not found then
    raise exception 'That service could not be found.' using errcode = 'B0001';
  end if;
end;
$$;

revoke all on function public.set_service_image(uuid, uuid, text) from public, anon;
grant execute on function public.set_service_image(uuid, uuid, text) to authenticated;

-- ============ BOOKINGS ============

create or replace function public.list_bookings(
  _business_id uuid,
  _from timestamptz default null,
  _to timestamptz default null,
  _status text default null
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_business_member(_business_id) then
    raise exception 'Not a member of this business.' using errcode = 'B0013';
  end if;
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x."startsAt")
    from (
      select
        b.id,
        b.service_id as "serviceId",
        s.name as "serviceName",
        s.duration_minutes as "durationMinutes",
        b.member_id as "memberId",
        m.staff_name as "staffName",
        b.customer_id as "customerId",
        b.customer_name as "customerName",
        b.customer_phone as "customerPhone",
        b.customer_email as "customerEmail",
        b.starts_at as "startsAt",
        b.ends_at as "endsAt",
        b.status,
        b.source,
        b.notes,
        b.sale_id as "saleId"
      from public.service_bookings b
      join public.services s on s.id = b.service_id
      left join public.business_members m on m.id = b.member_id
      where b.business_id = _business_id
        and (_from is null or b.starts_at >= _from)
        and (_to is null or b.starts_at < _to)
        and (_status is null or b.status = _status)
    ) x
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_bookings(uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.list_bookings(uuid, timestamptz, timestamptz, text) to authenticated;

create or replace function public.create_booking(
  _business_id uuid,
  _service_id uuid,
  _member_id uuid,
  _customer_id uuid,
  _customer_name text,
  _customer_phone text,
  _customer_email text,
  _starts_at timestamptz,
  _notes text,
  _source text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _svc public.services;
  _ends timestamptz;
  _id uuid;
  _status text := 'confirmed';
begin
  if not public.has_permission(_business_id, 'bookings.manage') then
    raise exception 'You do not have permission to manage bookings.' using errcode = 'B0002';
  end if;
  select * into _svc from public.services
    where id = _service_id and business_id = _business_id and deleted_at is null;
  if not found then
    raise exception 'That service could not be found.' using errcode = 'B0001';
  end if;
  _ends := _starts_at + make_interval(mins => _svc.duration_minutes);
  if public.booking_overlaps(_business_id, _member_id, _starts_at, _ends) then
    raise exception 'That time overlaps another appointment.' using errcode = 'B0001';
  end if;
  insert into public.service_bookings (
    business_id, service_id, member_id, customer_id, customer_name, customer_phone,
    customer_email, starts_at, ends_at, status, source, notes
  ) values (
    _business_id, _service_id, _member_id, _customer_id, btrim(_customer_name),
    nullif(btrim(coalesce(_customer_phone, '')), ''),
    nullif(btrim(coalesce(_customer_email, '')), ''),
    _starts_at, _ends, _status, coalesce(_source, 'walk_in'),
    nullif(btrim(coalesce(_notes, '')), '')
  ) returning id into _id;
  perform public.notify_service_event(
    _business_id, 'booking.confirmed', 'Booking confirmed',
    btrim(_customer_name) || ' booked ' || _svc.name, _id
  );
  return _id;
end;
$$;

revoke all on function public.create_booking(uuid, uuid, uuid, uuid, text, text, text, timestamptz, text, text) from public, anon;
grant execute on function public.create_booking(uuid, uuid, uuid, uuid, text, text, text, timestamptz, text, text) to authenticated;

create or replace function public.set_booking_status(
  _business_id uuid,
  _booking_id uuid,
  _status text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  _row public.service_bookings;
begin
  if not public.has_permission(_business_id, 'bookings.manage') then
    raise exception 'You do not have permission to manage bookings.' using errcode = 'B0002';
  end if;
  if _status not in ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show') then
    raise exception 'Unknown booking status.' using errcode = 'B0001';
  end if;
  select * into _row from public.service_bookings
    where id = _booking_id and business_id = _business_id for update;
  if not found then
    raise exception 'That booking could not be found.' using errcode = 'B0001';
  end if;
  update public.service_bookings set status = _status, updated_at = now()
    where id = _booking_id;
  perform public.notify_service_event(
    _business_id,
    case _status
      when 'cancelled' then 'booking.cancelled'
      when 'confirmed' then 'booking.confirmed'
      else 'booking.updated'
    end,
    'Booking ' || _status,
    _row.customer_name || ': ' || _status,
    _booking_id
  );
end;
$$;

revoke all on function public.set_booking_status(uuid, uuid, text) from public, anon;
grant execute on function public.set_booking_status(uuid, uuid, text) to authenticated;

create or replace function public.reschedule_booking(
  _business_id uuid,
  _booking_id uuid,
  _starts_at timestamptz,
  _member_id uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  _row public.service_bookings;
  _mins int;
  _ends timestamptz;
  _member uuid;
begin
  if not public.has_permission(_business_id, 'bookings.manage') then
    raise exception 'You do not have permission to manage bookings.' using errcode = 'B0002';
  end if;
  select * into _row from public.service_bookings
    where id = _booking_id and business_id = _business_id for update;
  if not found then
    raise exception 'That booking could not be found.' using errcode = 'B0001';
  end if;
  select duration_minutes into _mins from public.services where id = _row.service_id;
  _ends := _starts_at + make_interval(mins => _mins);
  _member := coalesce(_member_id, _row.member_id);
  if public.booking_overlaps(_business_id, _member, _starts_at, _ends, _booking_id) then
    raise exception 'That time overlaps another appointment.' using errcode = 'B0001';
  end if;
  update public.service_bookings
    set starts_at = _starts_at, ends_at = _ends, member_id = _member, updated_at = now()
    where id = _booking_id;
  perform public.notify_service_event(
    _business_id, 'booking.rescheduled', 'Booking rescheduled',
    _row.customer_name || ' moved', _booking_id
  );
end;
$$;

revoke all on function public.reschedule_booking(uuid, uuid, timestamptz, uuid) from public, anon;
grant execute on function public.reschedule_booking(uuid, uuid, timestamptz, uuid) to authenticated;

create or replace function public.list_booking_slots(
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
  if auth.uid() is not null and not public.is_business_member(_business_id) then
    raise exception 'Not a member of this business.' using errcode = 'B0013';
  end if;
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

revoke all on function public.list_booking_slots(uuid, uuid, date, uuid) from public;
grant execute on function public.list_booking_slots(uuid, uuid, date, uuid) to authenticated, anon;
