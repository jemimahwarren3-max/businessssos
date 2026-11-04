-- Staff hours lookup, closed days, and richer service reports.

create or replace function public.save_staff_hours(
  _business_id uuid,
  _member_id uuid,
  _hours jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare
  _row jsonb;
begin
  if not public.has_permission(_business_id, 'business.settings')
     and not public.has_permission(_business_id, 'bookings.manage')
     and not public.has_permission(_business_id, 'users.invite') then
    raise exception 'You do not have permission to set staff hours.' using errcode = 'B0002';
  end if;
  if not exists (
    select 1 from public.business_members
    where id = _member_id and business_id = _business_id
  ) then
    raise exception 'That team member could not be found.' using errcode = 'B0001';
  end if;
  delete from public.staff_hours where business_id = _business_id and member_id = _member_id;
  for _row in select value from jsonb_array_elements(_hours)
  loop
    insert into public.staff_hours (business_id, member_id, weekday, is_closed, open_time, close_time)
    values (
      _business_id, _member_id,
      (_row->>'weekday')::smallint,
      coalesce((_row->>'isClosed')::boolean, false),
      coalesce((_row->>'openTime')::time, '09:00'),
      coalesce((_row->>'closeTime')::time, '17:00')
    );
  end loop;
end;
$$;

create or replace function public.get_staff_hours(_business_id uuid, _member_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_business_member(_business_id) then
    raise exception 'Not a member of this business.' using errcode = 'B0013';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'weekday', weekday,
      'isClosed', is_closed,
      'openTime', to_char(open_time, 'HH24:MI'),
      'closeTime', to_char(close_time, 'HH24:MI')
    ) order by weekday)
    from public.staff_hours
    where business_id = _business_id and member_id = _member_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_staff_hours(uuid, uuid) from public, anon;
grant execute on function public.get_staff_hours(uuid, uuid) to authenticated;

create or replace function public.save_business_closures(_business_id uuid, _dates jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  _row jsonb;
begin
  if not public.has_permission(_business_id, 'business.settings')
     and not public.has_permission(_business_id, 'bookings.manage') then
    raise exception 'You do not have permission to set closed days.' using errcode = 'B0002';
  end if;
  delete from public.business_closures where business_id = _business_id;
  for _row in select value from jsonb_array_elements(coalesce(_dates, '[]'::jsonb))
  loop
    if nullif(btrim(_row->>'closedOn'), '') is null then
      continue;
    end if;
    insert into public.business_closures (business_id, closed_on, reason)
    values (
      _business_id,
      (_row->>'closedOn')::date,
      nullif(btrim(coalesce(_row->>'reason', '')), '')
    )
    on conflict (business_id, closed_on) do update set reason = excluded.reason;
  end loop;
end;
$$;

revoke all on function public.save_business_closures(uuid, jsonb) from public, anon;
grant execute on function public.save_business_closures(uuid, jsonb) to authenticated;

create or replace function public.get_booking_settings(_business_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_business_member(_business_id) then
    raise exception 'Not a member of this business.' using errcode = 'B0013';
  end if;
  return jsonb_build_object(
    'commerceModel', (select commerce_model from public.businesses where id = _business_id),
    'autoConfirmBookings', coalesce(
      (select auto_confirm_bookings from public.business_settings where business_id = _business_id),
      false
    ),
    'hours', coalesce((
      select jsonb_agg(jsonb_build_object(
        'weekday', weekday,
        'isClosed', is_closed,
        'openTime', to_char(open_time, 'HH24:MI'),
        'closeTime', to_char(close_time, 'HH24:MI')
      ) order by weekday)
      from public.business_hours where business_id = _business_id
    ), '[]'::jsonb),
    'closures', coalesce((
      select jsonb_agg(jsonb_build_object(
        'closedOn', to_char(closed_on, 'YYYY-MM-DD'),
        'reason', coalesce(reason, '')
      ) order by closed_on)
      from public.business_closures where business_id = _business_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_service_reports(_business_id uuid, _days int)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  _from timestamptz;
begin
  if not public.has_permission(_business_id, 'reports.financial') then
    raise exception 'You do not have permission to view reports.' using errcode = 'B0002';
  end if;
  _from := now() - make_interval(days => greatest(coalesce(_days, 30), 1));
  return jsonb_build_object(
    'serviceRevenue', coalesce((
      select sum(si.line_total) from public.sale_items si
      where si.business_id = _business_id and si.item_kind = 'service' and si.created_at >= _from
    ), 0),
    'bookingCount', (select count(*) from public.service_bookings where business_id = _business_id and created_at >= _from),
    'completedCount', (select count(*) from public.service_bookings where business_id = _business_id and status = 'completed' and updated_at >= _from),
    'cancelledCount', (select count(*) from public.service_bookings where business_id = _business_id and status = 'cancelled' and updated_at >= _from),
    'noShowCount', (select count(*) from public.service_bookings where business_id = _business_id and status = 'no_show' and updated_at >= _from),
    'outstanding', coalesce((
      select sum(s.price) from public.service_bookings b
      join public.services s on s.id = b.service_id
      where b.business_id = _business_id
        and b.status = 'completed'
        and b.sale_id is null
        and b.updated_at >= _from
    ), 0),
    'popularServices', coalesce((
      select jsonb_agg(jsonb_build_object('name', x.name, 'count', x.n, 'revenue', x.rev))
      from (
        select s.name, count(*)::int as n, coalesce(sum(si.line_total), 0) as rev
        from public.service_bookings b
        join public.services s on s.id = b.service_id
        left join public.sale_items si
          on si.service_id = s.id and si.business_id = _business_id and si.created_at >= _from
        where b.business_id = _business_id and b.created_at >= _from
        group by s.name
        order by count(*) desc
        limit 8
      ) x
    ), '[]'::jsonb),
    'revenueByStaff', coalesce((
      select jsonb_agg(jsonb_build_object('name', x.name, 'count', x.n, 'revenue', x.rev))
      from (
        select coalesce(nullif(m.staff_name, ''), 'Unassigned') as name,
               count(*)::int as n,
               coalesce(sum(s.price), 0) as rev
        from public.service_bookings b
        join public.services s on s.id = b.service_id
        left join public.business_members m on m.id = b.member_id
        where b.business_id = _business_id
          and b.status = 'completed'
          and b.updated_at >= _from
        group by 1
        order by coalesce(sum(s.price), 0) desc
        limit 8
      ) x
    ), '[]'::jsonb),
    'trends', coalesce((
      select jsonb_agg(jsonb_build_object('label', x.label, 'count', x.n) order by x.day)
      from (
        select date_trunc('day', b.starts_at at time zone 'Africa/Harare') as day,
               to_char(date_trunc('day', b.starts_at at time zone 'Africa/Harare'), 'DD Mon') as label,
               count(*)::int as n
        from public.service_bookings b
        where b.business_id = _business_id and b.created_at >= _from
        group by 1
        order by 1
      ) x
    ), '[]'::jsonb)
  );
end;
$$;
