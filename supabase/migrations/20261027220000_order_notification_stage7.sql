-- Stage 7: order email templates metadata, merchant alerts, payment updates, delivery history RPCs.
-- notification_outbox.channel stays 'email' today; future WhatsApp can reuse the same rows/events with channel = 'whatsapp'.

alter table public.notification_outbox
  add column if not exists email_template text,
  add column if not exists order_id uuid references public.store_orders(id) on delete set null,
  add column if not exists store_order_event_id uuid references public.store_order_events(id) on delete set null,
  add column if not exists recipient_role text check (recipient_role in ('customer', 'merchant')),
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists html_body text,
  add column if not exists provider_message_id text;

create index if not exists notification_outbox_order_idx
  on public.notification_outbox (business_id, order_id, created_at desc)
  where order_id is not null;

create or replace function public.get_order_notification_context(_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _order public.store_orders;
  _store public.storefronts;
  _items jsonb;
begin
  select * into _order from public.store_orders where id = _order_id;
  if not found then
    return null;
  end if;
  if auth.role() <> 'service_role' and not public.is_business_member(_order.business_id) then
    raise exception 'You do not have access to this business.' using errcode = 'B0002';
  end if;
  select * into _store from public.storefronts where business_id = _order.business_id limit 1;
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', name,
    'quantity', quantity,
    'lineTotal', line_total
  ) order by name), '[]'::jsonb)
  into _items
  from public.store_order_items where order_id = _order.id;

  return jsonb_build_object(
    'storeName', coalesce(_store.store_name, 'Shop'),
    'storeSlug', coalesce(_store.slug, ''),
    'orderReference', _order.reference,
    'customerName', _order.customer_name,
    'currency', _order.currency,
    'subtotal', _order.subtotal,
    'deliveryFee', _order.delivery_fee,
    'tax', _order.tax,
    'total', _order.total,
    'fulfilmentMethod', _order.fulfilment_method,
    'fulfilmentStatus', _order.fulfilment_status,
    'paymentMethod', _order.payment_method,
    'paymentStatus', _order.payment_status,
    'items', _items
  );
end;
$$;

revoke all on function public.get_order_notification_context(uuid) from public, anon;
grant execute on function public.get_order_notification_context(uuid) to authenticated, service_role;

create or replace function public.enqueue_shopper_order_email(
  _order_id uuid,
  _kind text,
  _access_token text default null,
  _event_id uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  _order public.store_orders;
  _store public.storefronts;
  _event public.store_order_events;
  _subject text;
  _body text;
  _key text;
  _email text;
  _template text;
  _meta jsonb := '{}'::jsonb;
begin
  if _kind not in ('placed', 'status', 'payment') then
    return;
  end if;

  select * into _order from public.store_orders where id = _order_id;
  if not found then
    return;
  end if;

  _email := nullif(lower(btrim(coalesce(_order.customer_email, ''))), '');
  if _email is null or _email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return;
  end if;

  select * into _store from public.storefronts where business_id = _order.business_id limit 1;
  if not found then
    return;
  end if;

  if _kind = 'placed' then
    _template := 'customer.order.placed';
    _key := _order.id::text || ':shopper:placed';
    _subject := 'Order ' || _order.reference || ' at ' || left(_store.store_name, 60);
    _body := 'Order placed at ' || _store.store_name || '.';
    _meta := jsonb_build_object(
      'accessToken', case when _access_token is not null and length(_access_token) >= 8 then _access_token else null end,
      'eventType', 'created'
    );
  elsif _kind = 'payment' then
    _template := 'customer.payment.updated';
    _key := _order.id::text || ':shopper:payment:' || coalesce(_order.payment_status, '');
    _subject := 'Payment update on order ' || _order.reference;
    _body := 'Payment status: ' || coalesce(_order.payment_status, '');
    _meta := jsonb_build_object('eventType', 'payment', 'eventMessage', _body);
  else
    if _event_id is null then
      return;
    end if;
    select * into _event from public.store_order_events
      where id = _event_id and order_id = _order_id;
    if not found or _event.event_type = 'created' then
      return;
    end if;
    _template := 'customer.order.status';
    _key := _order.id::text || ':shopper:event:' || _event.id::text;
    _subject := 'Update on order ' || _order.reference || ' at ' || left(_store.store_name, 60);
    _body := coalesce(_event.message, _event.event_type);
    _meta := jsonb_build_object(
      'eventType', _event.event_type,
      'eventMessage', _event.message
    );
  end if;

  insert into public.notification_outbox (
    business_id, notification_id, channel, to_email, subject, body,
    idempotency_key, email_template, order_id, store_order_event_id,
    recipient_role, metadata
  ) values (
    _order.business_id,
    null,
    'email',
    _email,
    left(_subject, 120),
    _body,
    _key,
    _template,
    _order.id,
    _event_id,
    'customer',
    _meta
  )
  on conflict (idempotency_key) do nothing;
end;
$$;

create or replace function public.enqueue_merchant_order_event_email()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  _order public.store_orders;
  _subject text;
  _body text;
  _template text := 'merchant.order.event';
begin
  -- New orders already enqueue merchant mail via public.notifications (store_order).
  if new.event_type = 'created' then
    return new;
  end if;
  if new.event_type in ('cancelled', 'paid', 'accepted', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed', 'seller_payment_confirmed') then
    select * into _order from public.store_orders where id = new.order_id;
    if not found then
      return new;
    end if;
    _subject := 'Order ' || _order.reference || ': ' || replace(coalesce(new.event_type, 'update'), '_', ' ');
    _body := coalesce(new.message, new.event_type);

    insert into public.notification_outbox (
      business_id, notification_id, channel, to_email, subject, body,
      idempotency_key, email_template, order_id, store_order_event_id,
      recipient_role, metadata
    )
    select
      new.business_id,
      null,
      'email',
      lower(u.email),
      left(_subject, 120),
      _body,
      new.order_id::text || ':merchant:event:' || new.id::text || ':' || lower(u.email),
      _template,
      new.order_id,
      new.id,
      'merchant',
      jsonb_build_object('eventType', new.event_type, 'eventMessage', new.message)
    from public.business_members m
    join auth.users u on u.id = m.user_id
    where m.business_id = new.business_id
      and m.is_active
      and m.notify_email
      and m.role in ('owner', 'admin', 'manager')
      and u.email is not null
      and length(btrim(u.email)) > 3
    on conflict (idempotency_key) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists store_order_events_merchant_email on public.store_order_events;
create trigger store_order_events_merchant_email
  after insert on public.store_order_events
  for each row execute function public.enqueue_merchant_order_event_email();

create or replace function public.list_order_email_deliveries(_business_id uuid, _order_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_business_member(_business_id) then
    raise exception 'You do not have access to this business.' using errcode = 'B0002';
  end if;
  if not exists (
    select 1 from public.store_orders
    where id = _order_id and business_id = _business_id
  ) then
    raise exception 'That order could not be found.' using errcode = 'B0001';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', o.id,
      'recipientRole', o.recipient_role,
      'toEmail', o.to_email,
      'subject', o.subject,
      'status', o.status,
      'attempts', o.attempts,
      'lastError', coalesce(o.last_error, ''),
      'emailTemplate', coalesce(o.email_template, ''),
      'createdAt', o.created_at,
      'sentAt', o.sent_at
    ) order by o.created_at desc)
    from public.notification_outbox o
    where o.business_id = _business_id and o.order_id = _order_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_order_email_deliveries(uuid, uuid) from public, anon;
grant execute on function public.list_order_email_deliveries(uuid, uuid) to authenticated;

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
      returning o.id, o.to_email, o.subject, o.body, o.attempts, o.notification_id,
        o.email_template, o.order_id, o.metadata
    )
    select jsonb_agg(jsonb_build_object(
      'id', u.id,
      'toEmail', u.to_email,
      'subject', u.subject,
      'body', u.body,
      'attempts', u.attempts,
      'notificationId', u.notification_id,
      'emailTemplate', u.email_template,
      'orderId', u.order_id,
      'metadata', coalesce(u.metadata, '{}'::jsonb)
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
      returning o.id, o.to_email, o.subject, o.body, o.attempts, o.notification_id,
        o.email_template, o.order_id, o.metadata
    )
    select jsonb_agg(jsonb_build_object(
      'id', u.id,
      'toEmail', u.to_email,
      'subject', u.subject,
      'body', u.body,
      'attempts', u.attempts,
      'notificationId', u.notification_id,
      'emailTemplate', u.email_template,
      'orderId', u.order_id,
      'metadata', coalesce(u.metadata, '{}'::jsonb)
    ))
    from updated u
  ), '[]'::jsonb);
end;
$$;

create or replace function public.retry_order_email_delivery(_business_id uuid, _outbox_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _row public.notification_outbox;
begin
  if not public.is_business_member(_business_id) then
    raise exception 'You do not have access to this business.' using errcode = 'B0002';
  end if;
  select * into _row
  from public.notification_outbox
  where id = _outbox_id and business_id = _business_id
  for update;
  if not found then
    raise exception 'That delivery could not be found.' using errcode = 'B0001';
  end if;
  if _row.status not in ('failed', 'pending') then
    raise exception 'Only failed or pending deliveries can be retried.' using errcode = 'B0001';
  end if;
  update public.notification_outbox
  set status = 'pending', available_at = now(), last_error = null
  where id = _outbox_id;
  return public.list_order_email_deliveries(_business_id, _row.order_id);
end;
$$;

revoke all on function public.retry_order_email_delivery(uuid, uuid) from public, anon;
grant execute on function public.retry_order_email_delivery(uuid, uuid) to authenticated;

create or replace function public.complete_notification_outbox(
  _id uuid,
  _status text,
  _error text default null,
  _provider_message_id text default null
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
  if _status = 'sent' and auth.role() <> 'service_role' then
    raise exception 'Delivery confirmation must come from the mail worker.' using errcode = 'B0002';
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
      sent_at = case when _status = 'sent' then now() else sent_at end,
      provider_message_id = case
        when _status = 'sent' and _provider_message_id is not null then left(_provider_message_id, 120)
        else provider_message_id
      end,
      metadata = case
        when _status = 'sent' then coalesce(metadata, '{}'::jsonb) - 'accessToken'
        else metadata
      end
    where id = _id;
end;
$$;
