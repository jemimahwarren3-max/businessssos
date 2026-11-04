-- Service businesses, hybrid commerce, bookings, and POS service lines.
-- Does not treat services as stock products. Existing product POS is unchanged.

-- ============ COMMERCE MODEL ============

alter table public.businesses
  add column if not exists commerce_model text not null default 'products'
    check (commerce_model in ('products', 'services', 'hybrid'));

update public.businesses
set commerce_model = case
  when coalesce(onboarding_config->>'sellsServices', 'false') in ('true', 't')
   and coalesce(onboarding_config->>'sellsProducts', 'true') in ('true', 't') then 'hybrid'
  when coalesce(onboarding_config->>'sellsServices', 'false') in ('true', 't') then 'services'
  when business_type in ('salon', 'services') then 'services'
  else 'products'
end
where commerce_model = 'products';

alter table public.business_settings
  add column if not exists auto_confirm_bookings boolean not null default false;

-- ============ TABLES ============

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  description text,
  price numeric(14,2) not null default 0 check (price >= 0),
  duration_minutes integer not null default 60 check (duration_minutes between 5 and 1440),
  image_url text,
  pricing_type text not null default 'fixed' check (pricing_type in ('fixed', 'quote')),
  requires_booking boolean not null default true,
  published boolean not null default false,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists services_business_idx on public.services (business_id) where deleted_at is null;

create table if not exists public.service_staff (
  service_id uuid not null references public.services(id) on delete cascade,
  member_id uuid not null references public.business_members(id) on delete cascade,
  primary key (service_id, member_id)
);

create table if not exists public.business_hours (
  business_id uuid not null references public.businesses(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  is_closed boolean not null default false,
  open_time time not null default '09:00',
  close_time time not null default '17:00',
  primary key (business_id, weekday)
);

create table if not exists public.staff_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  member_id uuid not null references public.business_members(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  is_closed boolean not null default false,
  open_time time not null default '09:00',
  close_time time not null default '17:00',
  unique (member_id, weekday)
);

create table if not exists public.business_closures (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  closed_on date not null,
  reason text,
  unique (business_id, closed_on)
);

create table if not exists public.service_bookings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete restrict,
  member_id uuid references public.business_members(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text not null,
  customer_phone text,
  customer_email text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show')),
  source text not null default 'walk_in'
    check (source in ('walk_in', 'phone', 'online', 'pos')),
  notes text,
  sale_id uuid references public.sales(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists service_bookings_business_starts_idx
  on public.service_bookings (business_id, starts_at);
create index if not exists service_bookings_member_idx
  on public.service_bookings (member_id, starts_at)
  where status not in ('cancelled', 'no_show');

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  customer_name text not null,
  customer_phone text,
  customer_email text,
  description text not null,
  preferred_date date,
  status text not null default 'pending'
    check (status in ('pending', 'quoted', 'accepted', 'declined', 'converted')),
  quote_id uuid references public.quotes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists service_requests_business_idx
  on public.service_requests (business_id, created_at desc);

alter table public.sale_items
  add column if not exists service_id uuid references public.services(id) on delete set null;
alter table public.sale_items
  add column if not exists item_kind text not null default 'product'
    check (item_kind in ('product', 'service'));

-- ============ RLS ============

alter table public.services enable row level security;
alter table public.service_staff enable row level security;
alter table public.business_hours enable row level security;
alter table public.staff_hours enable row level security;
alter table public.business_closures enable row level security;
alter table public.service_bookings enable row level security;
alter table public.service_requests enable row level security;

drop policy if exists "members read services" on public.services;
create policy "members read services" on public.services for select to authenticated
  using (public.is_business_member(business_id));
drop policy if exists "members read service staff" on public.service_staff;
create policy "members read service staff" on public.service_staff for select to authenticated
  using (exists (
    select 1 from public.services s
    where s.id = service_id and public.is_business_member(s.business_id)
  ));
drop policy if exists "members read business hours" on public.business_hours;
create policy "members read business hours" on public.business_hours for select to authenticated
  using (public.is_business_member(business_id));
drop policy if exists "members read staff hours" on public.staff_hours;
create policy "members read staff hours" on public.staff_hours for select to authenticated
  using (public.is_business_member(business_id));
drop policy if exists "members read closures" on public.business_closures;
create policy "members read closures" on public.business_closures for select to authenticated
  using (public.is_business_member(business_id));
drop policy if exists "members read bookings" on public.service_bookings;
create policy "members read bookings" on public.service_bookings for select to authenticated
  using (public.is_business_member(business_id));
drop policy if exists "members read service requests" on public.service_requests;
create policy "members read service requests" on public.service_requests for select to authenticated
  using (public.is_business_member(business_id));

grant select on public.services, public.service_staff, public.business_hours,
  public.staff_hours, public.business_closures, public.service_bookings,
  public.service_requests to authenticated;
grant all on public.services, public.service_staff, public.business_hours,
  public.staff_hours, public.business_closures, public.service_bookings,
  public.service_requests to service_role;

-- ============ PERMISSIONS ============

insert into public.permissions (key, category, label) values
  ('services.manage', 'Services', 'Create and edit services'),
  ('bookings.manage', 'Services', 'Manage bookings and requests')
on conflict (key) do nothing;

insert into public.business_role_permissions (business_id, role, permission_key)
select distinct brp.business_id, d.role, d.permission_key
from public.business_role_permissions brp
cross join (values
  ('admin'::public.app_role, 'services.manage'),
  ('manager'::public.app_role, 'services.manage'),
  ('admin'::public.app_role, 'bookings.manage'),
  ('manager'::public.app_role, 'bookings.manage'),
  ('cashier'::public.app_role, 'bookings.manage')
) as d(role, permission_key)
where not exists (
  select 1 from public.business_role_permissions x
  where x.business_id = brp.business_id
    and x.role = d.role
    and x.permission_key = d.permission_key
);

create or replace function public.seed_default_role_permissions(_business_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.business_role_permissions where business_id = _business_id) then
    return;
  end if;
  insert into public.business_role_permissions (business_id, role, permission_key)
  select _business_id, d.role, d.permission_key from (values
    ('admin'::public.app_role, 'sales.create'), ('manager'::public.app_role, 'sales.create'), ('cashier'::public.app_role, 'sales.create'),
    ('admin'::public.app_role, 'sales.import'), ('manager'::public.app_role, 'sales.import'), ('accountant'::public.app_role, 'sales.import'),
    ('admin'::public.app_role, 'payments.record'), ('manager'::public.app_role, 'payments.record'), ('cashier'::public.app_role, 'payments.record'), ('accountant'::public.app_role, 'payments.record'),
    ('admin'::public.app_role, 'inventory.import'), ('manager'::public.app_role, 'inventory.import'),
    ('admin'::public.app_role, 'customers.create'), ('manager'::public.app_role, 'customers.create'), ('cashier'::public.app_role, 'customers.create'), ('accountant'::public.app_role, 'customers.create'),
    ('admin'::public.app_role, 'customers.import'), ('manager'::public.app_role, 'customers.import'), ('cashier'::public.app_role, 'customers.import'), ('accountant'::public.app_role, 'customers.import'),
    ('admin'::public.app_role, 'customers.order'), ('manager'::public.app_role, 'customers.order'), ('accountant'::public.app_role, 'customers.order'),
    ('admin'::public.app_role, 'suppliers.view'), ('manager'::public.app_role, 'suppliers.view'),
    ('admin'::public.app_role, 'suppliers.create'), ('manager'::public.app_role, 'suppliers.create'),
    ('admin'::public.app_role, 'suppliers.edit'), ('manager'::public.app_role, 'suppliers.edit'),
    ('admin'::public.app_role, 'suppliers.delete'), ('manager'::public.app_role, 'suppliers.delete'),
    ('admin'::public.app_role, 'purchase_orders.create'), ('manager'::public.app_role, 'purchase_orders.create'),
    ('admin'::public.app_role, 'invoices.manage'), ('manager'::public.app_role, 'invoices.manage'), ('accountant'::public.app_role, 'invoices.manage'),
    ('admin'::public.app_role, 'quotes.manage'), ('manager'::public.app_role, 'quotes.manage'), ('accountant'::public.app_role, 'quotes.manage'),
    ('admin'::public.app_role, 'expenses.create'), ('manager'::public.app_role, 'expenses.create'), ('accountant'::public.app_role, 'expenses.create'),
    ('admin'::public.app_role, 'expenses.delete'),
    ('admin'::public.app_role, 'expenses.import'), ('manager'::public.app_role, 'expenses.import'), ('accountant'::public.app_role, 'expenses.import'),
    ('admin'::public.app_role, 'reports.financial'), ('manager'::public.app_role, 'reports.financial'), ('accountant'::public.app_role, 'reports.financial'),
    ('admin'::public.app_role, 'ai.use'), ('manager'::public.app_role, 'ai.use'), ('accountant'::public.app_role, 'ai.use'),
    ('admin'::public.app_role, 'users.view'),
    ('admin'::public.app_role, 'users.invite'),
    ('admin'::public.app_role, 'users.manage'),
    ('admin'::public.app_role, 'users.remove'),
    ('admin'::public.app_role, 'roles.manage'),
    ('admin'::public.app_role, 'business.settings'),
    ('admin'::public.app_role, 'business.billing'),
    ('admin'::public.app_role, 'business.export_data'),
    ('admin'::public.app_role, 'audit.view'),
    ('admin'::public.app_role, 'cash.drawer'), ('manager'::public.app_role, 'cash.drawer'), ('cashier'::public.app_role, 'cash.drawer'),
    ('admin'::public.app_role, 'services.manage'), ('manager'::public.app_role, 'services.manage'),
    ('admin'::public.app_role, 'bookings.manage'), ('manager'::public.app_role, 'bookings.manage'), ('cashier'::public.app_role, 'bookings.manage')
  ) as d(role, permission_key);
end;
$$;

revoke all on function public.seed_default_role_permissions(uuid) from public;
grant execute on function public.seed_default_role_permissions(uuid) to authenticated, service_role;

-- ============ HELPERS ============

create or replace function public.notify_service_event(
  _business_id uuid,
  _type text,
  _title text,
  _message text,
  _entity_id uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (business_id, type, title, message, severity, entity_type, entity_id)
  values (_business_id, _type, _title, _message, 'info', 'service_booking', _entity_id);
end;
$$;

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
      and (
        _member_id is null
        or b.member_id is null
        or b.member_id = _member_id
      )
      and b.starts_at < _ends
      and b.ends_at > _starts
      and (
        _member_id is not null and b.member_id = _member_id
      )
  );
$$;

-- ============ SETTINGS RPCs ============

create or replace function public.set_commerce_model(_business_id uuid, _model text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission(_business_id, 'business.settings') then
    raise exception 'You do not have permission to change business settings.' using errcode = 'B0002';
  end if;
  if _model not in ('products', 'services', 'hybrid') then
    raise exception 'Choose products, services, or hybrid.' using errcode = 'B0001';
  end if;
  update public.businesses set commerce_model = _model where id = _business_id;
  update public.business_settings set
    sells_services = (_model in ('services', 'hybrid')),
    tracks_stock = (_model in ('products', 'hybrid')),
    updated_at = now()
  where business_id = _business_id;
end;
$$;

revoke all on function public.set_commerce_model(uuid, text) from public, anon;
grant execute on function public.set_commerce_model(uuid, text) to authenticated;

create or replace function public.save_business_hours(
  _business_id uuid,
  _auto_confirm boolean,
  _hours jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare
  _row jsonb;
begin
  if not public.has_permission(_business_id, 'business.settings') then
    raise exception 'You do not have permission to change business settings.' using errcode = 'B0002';
  end if;
  update public.business_settings
    set auto_confirm_bookings = coalesce(_auto_confirm, false), updated_at = now()
    where business_id = _business_id;
  delete from public.business_hours where business_id = _business_id;
  for _row in select value from jsonb_array_elements(_hours)
  loop
    insert into public.business_hours (business_id, weekday, is_closed, open_time, close_time)
    values (
      _business_id,
      (_row->>'weekday')::smallint,
      coalesce((_row->>'isClosed')::boolean, false),
      coalesce((_row->>'openTime')::time, '09:00'),
      coalesce((_row->>'closeTime')::time, '17:00')
    );
  end loop;
end;
$$;

revoke all on function public.save_business_hours(uuid, boolean, jsonb) from public, anon;
grant execute on function public.save_business_hours(uuid, boolean, jsonb) to authenticated;

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
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_booking_settings(uuid) from public, anon;
grant execute on function public.get_booking_settings(uuid) to authenticated;

create or replace function public.save_staff_hours(
  _business_id uuid,
  _member_id uuid,
  _hours jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare
  _row jsonb;
begin
  if not public.has_permission(_business_id, 'users.manage')
     and not public.has_permission(_business_id, 'business.settings') then
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

revoke all on function public.save_staff_hours(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_staff_hours(uuid, uuid, jsonb) to authenticated;
