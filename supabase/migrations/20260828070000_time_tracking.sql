-- Employee time tracking. A time_entries row per shift: clock_in always
-- set, clock_out null while a shift is open. Any active member clocks
-- themselves in/out; owner/admin see and can correct everyone's entries
-- (real timesheets need real corrections — someone forgets to clock out
-- most days). Deliberately standalone: no link to commission_rate or
-- payroll math, this is hours worked, not pay.

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  note text,
  created_at timestamptz not null default now()
);
create index time_entries_business_user_idx on public.time_entries(business_id, user_id, clock_in desc);
-- At most one open (clock_out is null) shift per person per business —
-- enforced at the schema level, not just in the RPC, since that's the
-- invariant a correct timesheet actually depends on.
create unique index time_entries_one_open_shift on public.time_entries(business_id, user_id)
  where clock_out is null;

alter table public.time_entries enable row level security;
create policy "members read own time entries" on public.time_entries for select to authenticated
  using (public.is_business_member(business_id) and user_id = auth.uid());
create policy "owners and admins read all time entries" on public.time_entries for select to authenticated
  using (public.has_business_role(business_id, array['owner','admin']::public.app_role[]));
-- No direct write policy — clock_in/clock_out/adjust/delete below are the
-- only path, all RPC (security definer, own checks), same as everywhere
-- else this session that has a real invariant to protect (here: the
-- one-open-shift rule, and "you can only clock yourself in").

create or replace function public.clock_in(_business_id uuid, _note text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _id uuid;
begin
  if not public.is_business_member(_business_id) then
    raise exception 'You are not a member of this business.' using errcode = 'B0002';
  end if;
  if exists (
    select 1 from public.time_entries
    where business_id = _business_id and user_id = auth.uid() and clock_out is null
  ) then
    raise exception 'You are already clocked in.' using errcode = 'B0001';
  end if;

  insert into public.time_entries (business_id, user_id, note)
  values (_business_id, auth.uid(), nullif(trim(_note), ''))
  returning id into _id;

  return _id;
end;
$$;
revoke all on function public.clock_in(uuid,text) from public, anon;
grant execute on function public.clock_in(uuid,text) to authenticated;

create or replace function public.clock_out(_business_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  _id uuid;
begin
  select id into _id from public.time_entries
    where business_id = _business_id and user_id = auth.uid() and clock_out is null
    for update;
  if not found then
    raise exception 'You are not currently clocked in.' using errcode = 'B0001';
  end if;

  update public.time_entries set clock_out = now() where id = _id;
end;
$$;
revoke all on function public.clock_out(uuid) from public, anon;
grant execute on function public.clock_out(uuid) to authenticated;

-- Owner/admin only — correcting someone else's shift (forgot to clock out,
-- wrong time). Both bounds required; use delete_time_entry to remove one
-- entirely instead of nulling clock_out back out (that would just reopen a
-- shift with a stale clock_in, not actually correct anything).
create or replace function public.adjust_time_entry(
  _business_id uuid,
  _entry_id uuid,
  _clock_in timestamptz,
  _clock_out timestamptz
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_business_role(_business_id, array['owner','admin']::public.app_role[]) then
    raise exception 'Your role does not allow this action.' using errcode = 'B0002';
  end if;
  if _clock_in is null or _clock_out is null or _clock_out <= _clock_in then
    raise exception 'Clock-out must be after clock-in.' using errcode = 'B0001';
  end if;

  update public.time_entries set clock_in = _clock_in, clock_out = _clock_out
    where id = _entry_id and business_id = _business_id;
  if not found then
    raise exception 'That time entry could not be found.' using errcode = 'B0001';
  end if;
end;
$$;
revoke all on function public.adjust_time_entry(uuid,uuid,timestamptz,timestamptz) from public, anon;
grant execute on function public.adjust_time_entry(uuid,uuid,timestamptz,timestamptz) to authenticated;

create or replace function public.delete_time_entry(_business_id uuid, _entry_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_business_role(_business_id, array['owner','admin']::public.app_role[]) then
    raise exception 'Your role does not allow this action.' using errcode = 'B0002';
  end if;
  delete from public.time_entries where id = _entry_id and business_id = _business_id;
  if not found then
    raise exception 'That time entry could not be found.' using errcode = 'B0001';
  end if;
end;
$$;
revoke all on function public.delete_time_entry(uuid,uuid) from public, anon;
grant execute on function public.delete_time_entry(uuid,uuid) to authenticated;

-- Owner/admin timesheet view across everyone, with display names resolved
-- the same way list_team_members does.
create or replace function public.list_time_entries(
  _business_id uuid,
  _start_date date,
  _end_date date
) returns table(
  id uuid,
  user_id uuid,
  display_name text,
  clock_in timestamptz,
  clock_out timestamptz,
  note text
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_business_role(_business_id, array['owner','admin']::public.app_role[]) then
    raise exception 'You do not have permission to view timesheets.' using errcode = 'B0002';
  end if;

  return query
    select
      t.id, t.user_id,
      coalesce(nullif(m.staff_name, ''), nullif(u.raw_user_meta_data->>'full_name', ''), u.email::text),
      t.clock_in, t.clock_out, t.note
    from public.time_entries t
    join auth.users u on u.id = t.user_id
    left join public.business_members m on m.business_id = t.business_id and m.user_id = t.user_id
    where t.business_id = _business_id
      and t.clock_in::date between _start_date and _end_date
    order by t.clock_in desc;
end;
$$;
revoke all on function public.list_time_entries(uuid,date,date) from public, anon;
grant execute on function public.list_time_entries(uuid,date,date) to authenticated;
