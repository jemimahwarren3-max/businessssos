-- Merchant notification outbox. In-app rows already exist. This queues
-- email copies for owner/admin/manager members who opted in, and alerts
-- once when on-hand stock crosses the product threshold. Email is sent
-- by the Node app only when a provider is configured.

alter table public.notifications
  add column if not exists entity_type text,
  add column if not exists entity_id uuid;

alter table public.business_members
  add column if not exists notify_email boolean not null default true;

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  notification_id uuid not null references public.notifications(id) on delete cascade,
  channel text not null default 'email' check (channel in ('email')),
  to_email text not null,
  subject text not null,
  body text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  idempotency_key text not null,
  available_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (idempotency_key)
);
create index if not exists notification_outbox_pending_idx
  on public.notification_outbox (available_at)
  where status = 'pending';
create index if not exists notification_outbox_business_idx
  on public.notification_outbox (business_id, created_at desc);

alter table public.notification_outbox enable row level security;
grant all on public.notification_outbox to service_role;

create or replace function public.enqueue_notification_emails()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;
  if new.type not in (
    'store_order', 'store_complaint', 'store_review', 'store_listing_report', 'low_stock'
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
      'Open BusinessOS to handle this. This is a shop alert, not a marketing message. WhatsApp is not used to send this alert.'),
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

drop trigger if exists notifications_enqueue_emails on public.notifications;
create trigger notifications_enqueue_emails
  after insert on public.notifications
  for each row execute function public.enqueue_notification_emails();

create or replace function public.notify_low_stock()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.stock > new.low_stock_threshold then
    return new;
  end if;
  if old.stock is not null and old.stock <= old.low_stock_threshold then
    return new;
  end if;
  if exists (
    select 1 from public.notifications n
    where n.business_id = new.business_id
      and n.type = 'low_stock'
      and n.entity_id = new.id
      and n.is_read = false
  ) then
    return new;
  end if;

  insert into public.notifications (
    business_id, type, title, message, severity, link, entity_type, entity_id
  ) values (
    new.business_id,
    'low_stock',
    'Low stock: ' || left(new.name, 80),
    'On-hand is now ' || trim(both from to_char(new.stock, 'FM999999990.###')) ||
      ' (alert level ' || new.low_stock_threshold || ').',
    'warning',
    '/inventory',
    'product',
    new.id
  );
  return new;
end;
$$;

drop trigger if exists products_notify_low_stock on public.products;
create trigger products_notify_low_stock
  after update of stock on public.products
  for each row execute function public.notify_low_stock();

create or replace function public.set_notify_email(_business_id uuid, _enabled boolean)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_business_member(_business_id) then
    raise exception 'You do not have access to this business.' using errcode = 'B0002';
  end if;
  update public.business_members
    set notify_email = coalesce(_enabled, true)
    where business_id = _business_id and user_id = auth.uid() and is_active;
  if not found then
    raise exception 'You do not have access to this business.' using errcode = 'B0002';
  end if;
  return coalesce(_enabled, true);
end;
$$;

create or replace function public.get_notify_email(_business_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  _enabled boolean;
begin
  if not public.is_business_member(_business_id) then
    raise exception 'You do not have access to this business.' using errcode = 'B0002';
  end if;
  select notify_email into _enabled
    from public.business_members
    where business_id = _business_id and user_id = auth.uid() and is_active
    limit 1;
  return coalesce(_enabled, true);
end;
$$;

create or replace function public.claim_notification_outbox(_business_id uuid, _limit integer)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _cap integer;
begin
  if not public.is_business_member(_business_id) then
    raise exception 'You do not have access to this business.' using errcode = 'B0002';
  end if;
  _cap := least(greatest(coalesce(_limit, 10), 1), 25);
  return coalesce((
    with picked as (
      select o.id
      from public.notification_outbox o
      where o.business_id = _business_id
        and (
          (o.status = 'pending' and o.available_at <= now())
          or (o.status = 'sending' and o.available_at < now() - interval '10 minutes')
        )
      order by o.created_at
      limit _cap
      for update skip locked
    ),
    updated as (
      update public.notification_outbox o
      set status = 'sending', attempts = o.attempts + 1, available_at = now()
      from picked
      where o.id = picked.id
      returning o.id, o.to_email, o.subject, o.body, o.attempts, o.notification_id
    )
    select jsonb_agg(jsonb_build_object(
      'id', u.id,
      'toEmail', u.to_email,
      'subject', u.subject,
      'body', u.body,
      'attempts', u.attempts,
      'notificationId', u.notification_id
    ))
    from updated u
  ), '[]'::jsonb);
end;
$$;

create or replace function public.claim_notification_outbox_admin(_limit integer)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _cap integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Not allowed.' using errcode = 'B0002';
  end if;
  _cap := least(greatest(coalesce(_limit, 10), 1), 25);
  return coalesce((
    with picked as (
      select o.id
      from public.notification_outbox o
      where (
          (o.status = 'pending' and o.available_at <= now())
          or (o.status = 'sending' and o.available_at < now() - interval '10 minutes')
        )
      order by o.created_at
      limit _cap
      for update skip locked
    ),
    updated as (
      update public.notification_outbox o
      set status = 'sending', attempts = o.attempts + 1, available_at = now()
      from picked
      where o.id = picked.id
      returning o.id, o.to_email, o.subject, o.body, o.attempts, o.notification_id
    )
    select jsonb_agg(jsonb_build_object(
      'id', u.id,
      'toEmail', u.to_email,
      'subject', u.subject,
      'body', u.body,
      'attempts', u.attempts,
      'notificationId', u.notification_id
    ))
    from updated u
  ), '[]'::jsonb);
end;
$$;

create or replace function public.complete_notification_outbox(
  _id uuid,
  _status text,
  _error text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  _row public.notification_outbox;
  _next timestamptz;
begin
  if _status not in ('sent', 'failed', 'skipped') then
    raise exception 'That delivery status is not valid.' using errcode = 'B0001';
  end if;
  select * into _row from public.notification_outbox where id = _id;
  if not found then
    raise exception 'That delivery could not be found.' using errcode = 'B0001';
  end if;
  if auth.role() <> 'service_role' and not public.is_business_member(_row.business_id) then
    raise exception 'You do not have access to this business.' using errcode = 'B0002';
  end if;

  if _status = 'failed' and _row.attempts < 8 then
    _next := now() + (interval '1 minute' * (2 ^ least(_row.attempts, 6)));
    update public.notification_outbox
      set status = 'pending', last_error = nullif(_error, ''), available_at = _next
      where id = _id;
    return;
  end if;

  update public.notification_outbox
    set
      status = _status,
      last_error = nullif(_error, ''),
      sent_at = case when _status = 'sent' then now() else sent_at end
    where id = _id;
end;
$$;

revoke all on function public.enqueue_notification_emails() from public;
revoke all on function public.notify_low_stock() from public;
revoke all on function public.set_notify_email(uuid, boolean) from public;
revoke all on function public.get_notify_email(uuid) from public;
revoke all on function public.claim_notification_outbox(uuid, integer) from public;
revoke all on function public.claim_notification_outbox_admin(integer) from public;
revoke all on function public.complete_notification_outbox(uuid, text, text) from public;

grant execute on function public.set_notify_email(uuid, boolean) to authenticated;
grant execute on function public.get_notify_email(uuid) to authenticated;
grant execute on function public.claim_notification_outbox(uuid, integer) to authenticated;
grant execute on function public.complete_notification_outbox(uuid, text, text) to authenticated, service_role;
grant execute on function public.claim_notification_outbox_admin(integer) to service_role;
