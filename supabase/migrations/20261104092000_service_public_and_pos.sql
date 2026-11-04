-- Public storefront services, POS service lines, onboarding, notifications.

alter table public.audit_logs drop constraint if exists audit_logs_action_check;
alter table public.audit_logs
  add constraint audit_logs_action_check check (
    action in (
      'business.created', 'product.created', 'products.imported',
      'inventory.adjusted', 'customer.created', 'quote.status_changed',
      'expense.created', 'expense.deleted', 'expenses.imported', 'sales.imported',
      'sale.created', 'invoice.created', 'invoice.status_changed',
      'payment.recorded', 'quote.created', 'quote.converted', 'data.exported',
      'supplier.created', 'supplier.updated', 'supplier.deleted',
      'purchase_order.created', 'sales.imported_detailed', 'customers.imported',
      'team.invited', 'team.invite_revoked', 'team.role_changed', 'team.member_removed',
      'team.staff_created', 'team.staff_password_reset', 'team.shop_password_set',
      'team.permission_changed', 'purchase_order.status_changed', 'sale.refunded',
      'recurring_invoice.created', 'team.commission_rate_set',
      'storefront.saved', 'storefront.published', 'storefront.unpublished',
      'storefront.marketplace',
      'store_order.created', 'store_order.updated', 'store_order.paid', 'store_order.cancelled',
      'store_order.claimed', 'store_order.proof_submitted', 'store_order.proof_rejected',
      'store_order.seller_payment_confirmed',
      'store_complaint.created', 'store_review.created', 'store_listing_report.created',
      'location.created', 'location.updated', 'location.deactivated',
      'cash_session.opened', 'cash_session.closed', 'cash.pay_in', 'cash.pay_out',
      'service.created', 'service.updated', 'booking.created'
    )
  );

create or replace function public.enqueue_notification_emails()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;
  if new.type not in (
    'store_order', 'store_complaint', 'store_review', 'store_listing_report', 'low_stock',
    'booking.request', 'booking.confirmed', 'booking.cancelled', 'booking.rescheduled',
    'booking.updated', 'service_request'
  ) then
    return new;
  end if;

  insert into public.notification_outbox (
    business_id, notification_id, channel, to_email, subject, body, idempotency_key
  )
  select
    new.business_id,
    new.id,
    'email',
    lower(u.email),
    left(new.title, 120),
    trim(both from coalesce(new.title, '') || e'\n\n' || coalesce(new.message, '') || e'\n\n' ||
      'Open Kwetuu to handle this. This is a shop alert, not a marketing message.'),
    new.id::text || ':email:' || lower(u.email)
  from public.business_members m
  join auth.users u on u.id = m.user_id
  where m.business_id = new.business_id
    and m.is_active
    and m.notify_email
    and m.role in ('owner', 'admin', 'manager')
    and u.email is not null
    and length(btrim(u.email)) > 3
  on conflict (idempotency_key) do nothing;

  return new;
end;
$$;

-- ============ PUBLIC STOREFRONT ============

create or replace function public.get_public_store_services(_slug text)
returns jsonb
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
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', sv.id,
      'name', sv.name,
      'description', coalesce(sv.description, ''),
      'price', sv.price,
      'durationMinutes', sv.duration_minutes,
      'imageUrl', sv.image_url,
      'pricingType', sv.pricing_type,
      'requiresBooking', sv.requires_booking,
      'categoryId', sv.category_id,
      'categoryName', c.name
    ) order by sv.name)
    from public.services sv
    left join public.categories c on c.id = sv.category_id
    where sv.business_id = _business
      and sv.deleted_at is null
      and sv.is_active
      and sv.published
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_public_store_services(text) from public;
grant execute on function public.get_public_store_services(text) to anon, authenticated;

create or replace function public.request_public_booking(
  _slug text,
  _service_id uuid,
  _starts_at timestamptz,
  _customer_name text,
  _customer_phone text,
  _customer_email text,
  _notes text,
  _member_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _business uuid;
  _svc public.services;
  _ends timestamptz;
  _id uuid;
  _status text;
  _auto boolean;
begin
  if length(btrim(coalesce(_customer_name, ''))) < 1 then
    raise exception 'Your name is required.' using errcode = 'B0001';
  end if;
  if length(btrim(coalesce(_customer_phone, ''))) < 5 then
    raise exception 'A phone number is required.' using errcode = 'B0001';
  end if;
  select s.business_id into _business
  from public.storefronts s
  where s.slug = _slug and s.status = 'published';
  if _business is null then
    raise exception 'That shop is not published.' using errcode = 'B0001';
  end if;
  select * into _svc from public.services
    where id = _service_id and business_id = _business
      and deleted_at is null and is_active and published;
  if not found then
    raise exception 'That service is not available.' using errcode = 'B0001';
  end if;
  if not _svc.requires_booking then
    raise exception 'This service is requested, not booked by time.' using errcode = 'B0001';
  end if;
  _ends := _starts_at + make_interval(mins => _svc.duration_minutes);
  if public.booking_overlaps(_business, _member_id, _starts_at, _ends) then
    raise exception 'That time is no longer available.' using errcode = 'B0001';
  end if;
  select coalesce(auto_confirm_bookings, false) into _auto
    from public.business_settings where business_id = _business;
  _status := case when _auto then 'confirmed' else 'pending' end;
  insert into public.service_bookings (
    business_id, service_id, member_id, customer_name, customer_phone, customer_email,
    starts_at, ends_at, status, source, notes
  ) values (
    _business, _service_id, _member_id, btrim(_customer_name),
    btrim(_customer_phone), nullif(btrim(coalesce(_customer_email, '')), ''),
    _starts_at, _ends, _status, 'online', nullif(btrim(coalesce(_notes, '')), '')
  ) returning id into _id;
  perform public.notify_service_event(
    _business,
    case when _status = 'confirmed' then 'booking.confirmed' else 'booking.request' end,
    case when _status = 'confirmed' then 'Booking confirmed' else 'New booking request' end,
    btrim(_customer_name) || ' requested ' || _svc.name,
    _id
  );
  return _id;
end;
$$;

revoke all on function public.request_public_booking(text, uuid, timestamptz, text, text, text, text, uuid) from public;
grant execute on function public.request_public_booking(text, uuid, timestamptz, text, text, text, text, uuid) to anon, authenticated;

create or replace function public.submit_service_request(
  _slug text,
  _service_id uuid,
  _customer_name text,
  _customer_phone text,
  _customer_email text,
  _description text,
  _preferred_date date
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _business uuid;
  _id uuid;
begin
  select s.business_id into _business
  from public.storefronts s
  where s.slug = _slug and s.status = 'published';
  if _business is null then
    raise exception 'That shop is not published.' using errcode = 'B0001';
  end if;
  insert into public.service_requests (
    business_id, service_id, customer_name, customer_phone, customer_email,
    description, preferred_date
  ) values (
    _business, _service_id, btrim(_customer_name), btrim(_customer_phone),
    nullif(btrim(coalesce(_customer_email, '')), ''),
    btrim(_description), _preferred_date
  ) returning id into _id;
  perform public.notify_service_event(
    _business, 'service_request', 'Quotation request',
    btrim(_customer_name) || ' sent a service request', _id
  );
  return _id;
end;
$$;

revoke all on function public.submit_service_request(text, uuid, text, text, text, text, date) from public;
grant execute on function public.submit_service_request(text, uuid, text, text, text, text, date) to anon, authenticated;

create or replace function public.list_service_requests(_business_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_business_member(_business_id) then
    raise exception 'Not a member of this business.' using errcode = 'B0013';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id,
      'serviceId', r.service_id,
      'serviceName', s.name,
      'customerName', r.customer_name,
      'customerPhone', r.customer_phone,
      'customerEmail', r.customer_email,
      'description', r.description,
      'preferredDate', r.preferred_date,
      'status', r.status,
      'createdAt', r.created_at
    ) order by r.created_at desc)
    from public.service_requests r
    left join public.services s on s.id = r.service_id
    where r.business_id = _business_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_service_requests(uuid) from public, anon;
grant execute on function public.list_service_requests(uuid) to authenticated;

create or replace function public.set_service_request_status(
  _business_id uuid, _request_id uuid, _status text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission(_business_id, 'bookings.manage') then
    raise exception 'You do not have permission to manage bookings.' using errcode = 'B0002';
  end if;
  if _status not in ('pending', 'quoted', 'accepted', 'declined', 'converted') then
    raise exception 'Unknown request status.' using errcode = 'B0001';
  end if;
  update public.service_requests
    set status = _status, updated_at = now()
    where id = _request_id and business_id = _business_id;
  if not found then
    raise exception 'That request could not be found.' using errcode = 'B0001';
  end if;
end;
$$;

revoke all on function public.set_service_request_status(uuid, uuid, text) from public, anon;
grant execute on function public.set_service_request_status(uuid, uuid, text) to authenticated;

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
    'popularServices', coalesce((
      select jsonb_agg(jsonb_build_object('name', x.name, 'count', x.n, 'revenue', x.rev))
      from (
        select s.name, count(*)::int as n, coalesce(sum(si.line_total), 0) as rev
        from public.service_bookings b
        join public.services s on s.id = b.service_id
        left join public.sale_items si on si.service_id = s.id and si.created_at >= _from
        where b.business_id = _business_id and b.created_at >= _from
        group by s.name
        order by count(*) desc
        limit 8
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_service_reports(uuid, int) from public, anon;
grant execute on function public.get_service_reports(uuid, int) to authenticated;

-- ============ ONBOARDING ============

create or replace function public.create_business_with_owner(
  _name text,
  _business_type public.business_type,
  _currency text,
  _phone text,
  _address text,
  _business_path text default 'management',
  _onboarding_config jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_business_id uuid;
  v_user_id uuid := auth.uid();
  v_model text;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to create a business.' using errcode = 'B0002';
  end if;

  select bm.business_id into v_business_id
  from public.business_members bm
  where bm.user_id = v_user_id and bm.is_active = true
  order by bm.created_at
  limit 1;
  if v_business_id is not null then
    return v_business_id;
  end if;

  if exists (select 1 from public.businesses where lower(trim(name)) = lower(trim(_name))) then
    raise exception 'That business name is already taken. Please choose another.' using errcode = 'B0001';
  end if;

  if _business_path not in ('management', 'full') then
    _business_path := 'management';
  end if;

  v_model := case
    when coalesce(_onboarding_config->>'sellsServices', 'false') in ('true', 't')
     and coalesce(_onboarding_config->>'sellsProducts', 'true') in ('true', 't') then 'hybrid'
    when coalesce(_onboarding_config->>'sellsServices', 'false') in ('true', 't') then 'services'
    else 'products'
  end;

  insert into public.businesses (
    name, business_type, currency, phone, address, created_by,
    onboarding_completed, business_path, onboarding_config, commerce_model
  )
  values (
    _name, _business_type, _currency, nullif(_phone, ''), nullif(_address, ''),
    v_user_id, true, _business_path, _onboarding_config, v_model
  )
  returning id into v_business_id;

  insert into public.business_members (business_id, user_id, role, staff_name)
  values (
    v_business_id, v_user_id, 'owner',
    (select raw_user_meta_data->>'full_name' from auth.users where id = v_user_id)
  );

  insert into public.business_settings (business_id, sells_services, tracks_stock)
  values (v_business_id, v_model in ('services', 'hybrid'), v_model in ('products', 'hybrid'));

  insert into public.locations (business_id, name, is_default, is_active)
  select v_business_id, 'Main', true, true
  where not exists (
    select 1 from public.locations
    where business_id = v_business_id and is_default
  );

  insert into public.subscriptions (
    business_id, plan, status, trial_ends_at, current_period_start, current_period_end
  )
  values (
    v_business_id, 'pro', 'trialing', now() + interval '1 month', now(), now() + interval '1 month'
  );

  return v_business_id;
end;
$$;

revoke all on function public.create_business_with_owner(text, public.business_type, text, text, text, text, jsonb) from public, anon;
grant execute on function public.create_business_with_owner(text, public.business_type, text, text, text, text, jsonb) to authenticated;

create or replace function public.get_setup_progress(_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_business_member(_business_id) then
    raise exception 'Not a member of this business.' using errcode = 'B0013';
  end if;

  return (
    select jsonb_build_object(
      'business_path', b.business_path,
      'setup_completed_at', b.setup_completed_at,
      'commerce_model', b.commerce_model,
      'has_products', (select count(*) > 0 from public.products where business_id = _business_id),
      'has_services', (select count(*) > 0 from public.services where business_id = _business_id and deleted_at is null),
      'product_count', (select count(*) from public.products where business_id = _business_id),
      'has_sales', (select count(*) > 0 from public.sales where business_id = _business_id),
      'sale_count', (select count(*) from public.sales where business_id = _business_id),
      'storefront_enabled', coalesce(b.storefront_enabled, false),
      'has_customers', (select count(*) > 0 from public.customers where business_id = _business_id),
      'has_team', (
        select count(*) > 1 from public.business_members
        where business_id = _business_id and is_active
      ),
      'onboarding_config', b.onboarding_config
    )
    from public.businesses b
    where b.id = _business_id
  );
end;
$$;

revoke all on function public.get_setup_progress(uuid) from public, anon;
grant execute on function public.get_setup_progress(uuid) to authenticated;
