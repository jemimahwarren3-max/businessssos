-- Replace stale "BusinessOS" text in the notification outbox email trigger.
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
