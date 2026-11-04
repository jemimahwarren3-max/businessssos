-- morning_desk / split_tenders CREATE OR REPLACE get_daily_takings without
-- excluding supplier payouts. Those files skip after first apply, but a
-- concurrent CI re-apply (or a skipIf miss) puts supplier cash into
-- "received" and notebook-delivery tests fail. Always restore the notebook
-- body: supplier payments are money out, not daily takings.

create or replace function public.get_daily_takings(
  _business_id uuid,
  _day date default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _tz text;
  _local_day date;
  _start timestamptz;
  _end timestamptz;
begin
  if not public.is_business_member(_business_id) then
    raise exception 'You do not have access to this business.' using errcode = 'B0002';
  end if;

  select coalesce(nullif(btrim(b.timezone), ''), 'Africa/Harare')
    into _tz
    from public.businesses b
    where b.id = _business_id;
  if _tz is null then
    raise exception 'That business could not be found.' using errcode = 'B0001';
  end if;

  begin
    _local_day := coalesce(_day, (timezone(_tz, now()))::date);
    _start := (_local_day::timestamp at time zone _tz);
    _end := (((_local_day + 1)::timestamp) at time zone _tz);
  exception when others then
    _tz := 'Africa/Harare';
    _local_day := coalesce(_day, (timezone(_tz, now()))::date);
    _start := (_local_day::timestamp at time zone _tz);
    _end := (((_local_day + 1)::timestamp) at time zone _tz);
  end;

  return jsonb_build_object(
    'day', _local_day,
    'timezone', _tz,
    'received', coalesce((
      select jsonb_agg(jsonb_build_object(
        'rail', t.rail,
        'method', t.method,
        'amount', t.amount
      ) order by t.amount desc)
      from (
        select
          coalesce(nullif(p.rail, ''), public.default_rail_for_method(p.method)) as rail,
          p.method::text as method,
          round(sum(p.amount), 2) as amount
        from public.payments p
        where p.business_id = _business_id
          and p.paid_at >= _start
          and p.paid_at < _end
          and p.method <> 'credit'
          and p.supplier_id is null
        group by 1, 2
      ) t
    ), '[]'::jsonb),
    'creditOnAccount', coalesce((
      select round(sum(greatest(s.total - coalesce(s.amount_paid, 0), 0)), 2)
      from public.sales s
      where s.business_id = _business_id
        and s.status in ('completed', 'partially_refunded')
        and s.created_at >= _start
        and s.created_at < _end
        and coalesce(s.amount_paid, 0) < s.total
    ), 0)
  );
end;
$$;

revoke all on function public.get_daily_takings(uuid, date) from public, anon;
grant execute on function public.get_daily_takings(uuid, date) to authenticated;
