-- Stage 5 (Messaging as a channel): WhatsApp outbox, order-update opt-in,
-- marketing opt-in list. Rows stay pending until WhatsApp Cloud is configured.
-- complete_notification_outbox cannot mark WhatsApp 'sent' without a provider
-- message id. Conversation APIs are not stubbed. create_sale is not rewritten.

alter table public.notification_outbox
  drop constraint if exists notification_outbox_channel_check;

alter table public.notification_outbox
  add constraint notification_outbox_channel_check
  check (channel in ('email', 'whatsapp'));

alter table public.notification_outbox
  alter column to_email drop not null;

alter table public.notification_outbox
  add column if not exists to_phone text;

alter table public.notification_outbox
  drop constraint if exists notification_outbox_recipient_check;

alter table public.notification_outbox
  add constraint notification_outbox_recipient_check
  check (
    (channel = 'email' and to_email is not null)
    or (channel = 'whatsapp' and to_phone is not null)
  );

alter table public.store_orders
  add column if not exists whatsapp_updates boolean not null default false;

comment on column public.store_orders.whatsapp_updates is
  'Shopper opted in to transactional WhatsApp order updates on this order. Not marketing.';

alter table public.shopper_shop_consents
  add column if not exists marketing boolean not null default false;

comment on column public.shopper_shop_consents.marketing is
  'Signed-in shopper opted in to this shop''s WhatsApp news list. Separate from order updates.';

create or replace function public.enqueue_shopper_order_whatsapp(
  _order_id uuid,
  _kind text,
  _event_id uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  _order public.store_orders;
  _store public.storefronts;
  _event public.store_order_events;
  _phone text;
  _subject text;
  _body text;
  _key text;
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
  if not coalesce(_order.whatsapp_updates, false) then
    return;
  end if;

  _phone := nullif(regexp_replace(coalesce(_order.customer_phone, ''), '[^0-9+]', '', 'g'), '');
  if _phone is null or length(regexp_replace(_phone, '\D', '', 'g')) < 7 then
    return;
  end if;

  select * into _store from public.storefronts where business_id = _order.business_id limit 1;
  if not found then
    return;
  end if;

  if _kind = 'placed' then
    _template := 'customer.order.placed';
    _key := _order.id::text || ':whatsapp:placed';
    _subject := 'Order ' || _order.reference || ' at ' || left(_store.store_name, 60);
    _body := 'Order ' || _order.reference || ' at ' || _store.store_name
      || ' is received. Total ' || _order.currency || ' '
      || trim(both from to_char(_order.total, 'FM999999990.00'))
      || '. This is a transactional order update, not marketing.';
    _meta := jsonb_build_object('eventType', 'created');
  elsif _kind = 'payment' then
    _template := 'customer.payment.updated';
    _key := _order.id::text || ':whatsapp:payment:' || coalesce(_order.payment_status, '');
    _subject := 'Payment update on order ' || _order.reference;
    _body := 'Payment on order ' || _order.reference || ' is now '
      || coalesce(_order.payment_status, 'updated')
      || '. This is a transactional order update, not marketing.';
    _meta := jsonb_build_object('eventType', 'payment');
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
    _key := _order.id::text || ':whatsapp:event:' || _event.id::text;
    _subject := 'Update on order ' || _order.reference;
    _body := 'Order ' || _order.reference || ' at ' || _store.store_name || ': '
      || coalesce(_event.message, replace(_event.event_type, '_', ' '))
      || '. This is a transactional order update, not marketing.';
    _meta := jsonb_build_object(
      'eventType', _event.event_type,
      'eventMessage', _event.message
    );
  end if;

  insert into public.notification_outbox (
    business_id, notification_id, channel, to_email, to_phone, subject, body,
    idempotency_key, email_template, order_id, store_order_event_id,
    recipient_role, metadata
  ) values (
    _order.business_id,
    null,
    'whatsapp',
    null,
    left(_phone, 20),
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

revoke all on function public.enqueue_shopper_order_whatsapp(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.enqueue_shopper_order_whatsapp(uuid, text, uuid) to service_role;

create or replace function public.enqueue_shopper_order_whatsapp_from_event()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.event_type = 'created' then
    return new;
  end if;
  if new.event_type in (
    'cancelled', 'paid', 'accepted', 'confirmed', 'preparing', 'ready',
    'out_for_delivery', 'completed', 'seller_payment_confirmed'
  ) then
    perform public.enqueue_shopper_order_whatsapp(new.order_id, 'status', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists store_order_events_shopper_whatsapp on public.store_order_events;
create trigger store_order_events_shopper_whatsapp
  after insert on public.store_order_events
  for each row execute function public.enqueue_shopper_order_whatsapp_from_event();

create or replace function public.record_order_messaging_opt_in(
  _order_id uuid,
  _access_token text,
  _whatsapp_updates boolean,
  _marketing boolean
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _order public.store_orders;
begin
  if not public.check_rate_limit('wa-opt-in:' || coalesce(_order_id::text, ''), 20, 60) then
    raise exception 'Too many attempts. Please wait a moment and try again.' using errcode = 'B0001';
  end if;
  select * into _order from public.store_orders where id = _order_id;
  if not found then
    raise exception 'That order could not be found.' using errcode = 'B0001';
  end if;
  if not public.storefront_can_access_order(_order, coalesce(_access_token, '')) then
    raise exception 'That order could not be found.' using errcode = 'B0001';
  end if;

  update public.store_orders
    set whatsapp_updates = coalesce(_whatsapp_updates, false)
    where id = _order.id;

  if auth.uid() is not null then
    insert into public.shopper_shop_consents (user_id, business_id, messages, marketing)
    values (auth.uid(), _order.business_id, false, coalesce(_marketing, false))
    on conflict (user_id, business_id) do update
      set marketing = excluded.marketing;
  end if;

  if coalesce(_whatsapp_updates, false) then
    perform public.enqueue_shopper_order_whatsapp(_order.id, 'placed', null);
  end if;

  return jsonb_build_object(
    'orderId', _order.id,
    'whatsappUpdates', coalesce(_whatsapp_updates, false),
    'marketing', coalesce(_marketing, false) and auth.uid() is not null
  );
end;
$$;

revoke all on function public.record_order_messaging_opt_in(uuid, text, boolean, boolean) from public;
grant execute on function public.record_order_messaging_opt_in(uuid, text, boolean, boolean)
  to anon, authenticated;

create or replace function public.get_shopper_account(_slug text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _store public.storefronts;
  _orders jsonb;
  _consent boolean := false;
  _marketing boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Sign in to see your orders.' using errcode = 'B0002';
  end if;
  if not public.check_rate_limit('shopper-account:' || auth.uid()::text, 30, 60) then
    raise exception 'Too many attempts. Please wait a moment and try again.' using errcode = 'B0001';
  end if;
  select * into _store from public.storefronts where slug = lower(coalesce(_slug, ''));
  if not found then
    raise exception 'This shop is not available.' using errcode = 'B0001';
  end if;
  select coalesce(messages, false), coalesce(marketing, false)
    into _consent, _marketing
    from public.shopper_shop_consents
    where user_id = auth.uid() and business_id = _store.business_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'reference', o.reference,
    'createdAt', o.created_at,
    'total', o.total,
    'currency', o.currency,
    'fulfilmentStatus', o.fulfilment_status,
    'paymentStatus', o.payment_status,
    'paymentMethod', o.payment_method,
    'fulfilmentMethod', o.fulfilment_method,
    'itemSummary', (
      select string_agg(trim(both from to_char(i.quantity, 'FM999999990.###')) || ' × ' || i.name, ', ' order by i.name)
      from public.store_order_items i where i.order_id = o.id
    ),
    'collectAt', o.collect_at
  ) order by o.created_at desc), '[]'::jsonb) into _orders
  from public.store_orders o
  where o.business_id = _store.business_id and o.shopper_user_id = auth.uid();
  return jsonb_build_object(
    'messagesConsent', coalesce(_consent, false),
    'marketingConsent', coalesce(_marketing, false),
    'orders', _orders
  );
end;
$$;

grant execute on function public.get_shopper_account(text) to authenticated;

create or replace function public.set_shopper_marketing_consent(_slug text, _marketing boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _store public.storefronts;
begin
  if auth.uid() is null then
    raise exception 'Sign in to update your preferences.' using errcode = 'B0002';
  end if;
  select * into _store from public.storefronts where slug = lower(coalesce(_slug, ''));
  if not found then
    raise exception 'This shop is not available.' using errcode = 'B0001';
  end if;
  insert into public.shopper_shop_consents (user_id, business_id, messages, marketing)
  values (auth.uid(), _store.business_id, false, coalesce(_marketing, false))
  on conflict (user_id, business_id) do update
    set marketing = excluded.marketing;
  return public.get_shopper_account(_slug);
end;
$$;

revoke all on function public.set_shopper_marketing_consent(text, boolean) from public, anon;
grant execute on function public.set_shopper_marketing_consent(text, boolean) to authenticated;

create or replace function public.list_whatsapp_marketing_audience(_business_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  _opted integer := 0;
  _with_phone integer := 0;
begin
  if not public.is_business_member(_business_id) then
    raise exception 'You do not have access to this business.' using errcode = 'B0002';
  end if;
  if not public.has_permission(_business_id, 'business.settings') then
    raise exception 'You do not have permission to manage marketing.' using errcode = 'B0002';
  end if;
  select count(*) into _opted
    from public.shopper_shop_consents
    where business_id = _business_id and marketing = true;
  select count(*) into _with_phone
    from public.shopper_shop_consents c
    where c.business_id = _business_id
      and c.marketing = true
      and exists (
        select 1 from public.store_orders o
        where o.business_id = _business_id
          and o.shopper_user_id = c.user_id
          and length(regexp_replace(coalesce(o.customer_phone, ''), '\D', '', 'g')) >= 7
      );
  return jsonb_build_object('optedIn', _opted, 'withPhone', _with_phone);
end;
$$;

revoke all on function public.list_whatsapp_marketing_audience(uuid) from public, anon;
grant execute on function public.list_whatsapp_marketing_audience(uuid) to authenticated;

create or replace function public.queue_whatsapp_marketing(
  _business_id uuid,
  _campaign_id uuid,
  _copy text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _campaign public.store_marketing_campaigns;
  _body text;
  _queued integer := 0;
  _skipped integer := 0;
  _row record;
  _phone text;
begin
  if not public.is_business_member(_business_id) then
    raise exception 'You do not have access to this business.' using errcode = 'B0002';
  end if;
  if not public.has_permission(_business_id, 'business.settings') then
    raise exception 'You do not have permission to manage marketing.' using errcode = 'B0002';
  end if;
  select * into _campaign
    from public.store_marketing_campaigns
    where id = _campaign_id and business_id = _business_id;
  if not found then
    raise exception 'That campaign could not be found.' using errcode = 'B0001';
  end if;
  _body := left(btrim(coalesce(_copy, _campaign.copy, '')), 1000);
  if length(_body) < 8 then
    raise exception 'Write a message of at least 8 characters.' using errcode = 'B0001';
  end if;

  for _row in
    select c.user_id
    from public.shopper_shop_consents c
    where c.business_id = _business_id and c.marketing = true
    order by c.updated_at desc
    limit 100
  loop
    select nullif(regexp_replace(o.customer_phone, '[^0-9+]', '', 'g'), '')
      into _phone
      from public.store_orders o
      where o.business_id = _business_id
        and o.shopper_user_id = _row.user_id
        and length(regexp_replace(coalesce(o.customer_phone, ''), '\D', '', 'g')) >= 7
      order by o.created_at desc
      limit 1;
    if _phone is null then
      _skipped := _skipped + 1;
      continue;
    end if;
    insert into public.notification_outbox (
      business_id, notification_id, channel, to_email, to_phone, subject, body,
      idempotency_key, email_template, recipient_role, metadata
    ) values (
      _business_id,
      null,
      'whatsapp',
      null,
      left(_phone, 20),
      left(coalesce(_campaign.headline, _campaign.name, 'Shop news'), 120),
      _body || E'\n\nYou opted in to WhatsApp news from this shop. Reply STOP to opt out. This is not sent until WhatsApp Cloud is connected.',
      _campaign_id::text || ':whatsapp:' || _row.user_id::text,
      'marketing.broadcast',
      'customer',
      jsonb_build_object('campaignId', _campaign_id, 'kind', 'marketing')
    )
    on conflict (idempotency_key) do nothing;
    if found then
      _queued := _queued + 1;
    end if;
  end loop;

  return jsonb_build_object('queued', _queued, 'skippedNoPhone', _skipped);
end;
$$;

revoke all on function public.queue_whatsapp_marketing(uuid, uuid, text) from public, anon;
grant execute on function public.queue_whatsapp_marketing(uuid, uuid, text) to authenticated;

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
      'channel', o.channel,
      'recipientRole', o.recipient_role,
      'toEmail', coalesce(o.to_email, ''),
      'toPhone', coalesce(o.to_phone, ''),
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

drop function if exists public.claim_notification_outbox(uuid, integer);
drop function if exists public.claim_notification_outbox(uuid, integer, text);
create function public.claim_notification_outbox(
  _business_id uuid,
  _limit integer,
  _channel text default 'email'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _cap integer;
  _ch text;
begin
  if not public.is_business_member(_business_id) then
    raise exception 'You do not have access to this business.' using errcode = 'B0002';
  end if;
  _ch := case when _channel = 'whatsapp' then 'whatsapp' else 'email' end;
  _cap := least(greatest(coalesce(_limit, 10), 1), 25);
  return coalesce((
    with picked as (
      select o.id
      from public.notification_outbox o
      where o.business_id = _business_id
        and o.channel = _ch
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
      returning o.id, o.channel, o.to_email, o.to_phone, o.subject, o.body, o.attempts,
        o.notification_id, o.email_template, o.order_id, o.metadata
    )
    select jsonb_agg(jsonb_build_object(
      'id', u.id,
      'channel', u.channel,
      'toEmail', u.to_email,
      'toPhone', u.to_phone,
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

drop function if exists public.claim_notification_outbox_admin(integer);
drop function if exists public.claim_notification_outbox_admin(integer, text);
create function public.claim_notification_outbox_admin(
  _limit integer,
  _channel text default 'email'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _cap integer;
  _ch text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Not allowed.' using errcode = 'B0002';
  end if;
  _ch := case when _channel = 'whatsapp' then 'whatsapp' else 'email' end;
  _cap := least(greatest(coalesce(_limit, 10), 1), 25);
  return coalesce((
    with picked as (
      select o.id
      from public.notification_outbox o
      where o.channel = _ch
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
      returning o.id, o.channel, o.to_email, o.to_phone, o.subject, o.body, o.attempts,
        o.notification_id, o.email_template, o.order_id, o.metadata
    )
    select jsonb_agg(jsonb_build_object(
      'id', u.id,
      'channel', u.channel,
      'toEmail', u.to_email,
      'toPhone', u.to_phone,
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

grant execute on function public.claim_notification_outbox(uuid, integer, text) to authenticated;
grant execute on function public.claim_notification_outbox_admin(integer, text) to service_role;

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
  if _status = 'sent'
     and _row.channel = 'whatsapp'
     and nullif(btrim(coalesce(_provider_message_id, '')), '') is null then
    raise exception 'WhatsApp cannot be marked sent without a provider message id.' using errcode = 'B0001';
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

grant execute on function public.complete_notification_outbox(uuid, text, text, text)
  to authenticated, service_role;
