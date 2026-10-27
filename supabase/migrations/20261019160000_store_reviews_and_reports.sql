-- Verified-purchase reviews (order access code + line item) and public
-- listing reports. No anonymous star ratings and no invented averages.

create table if not exists public.store_reviews (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  order_id uuid not null references public.store_orders(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  body text not null,
  display_name text not null,
  status text not null default 'published' check (status in ('published', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, product_id)
);
create index if not exists store_reviews_product_idx
  on public.store_reviews (product_id, status, created_at desc);
create index if not exists store_reviews_business_idx
  on public.store_reviews (business_id, created_at desc);
create trigger store_reviews_updated before update on public.store_reviews
  for each row execute function public.set_updated_at();

alter table public.store_reviews enable row level security;
grant select on public.store_reviews to authenticated;
grant all on public.store_reviews to service_role;

drop policy if exists store_reviews_member_read on public.store_reviews;
create policy store_reviews_member_read on public.store_reviews
  for select to authenticated
  using (public.is_business_member(business_id));

create table if not exists public.store_listing_reports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  reason text not null check (reason in ('misleading', 'prohibited', 'spam', 'other')),
  detail text not null,
  reporter_contact text,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved')),
  merchant_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists store_listing_reports_business_idx
  on public.store_listing_reports (business_id, created_at desc);
create trigger store_listing_reports_updated before update on public.store_listing_reports
  for each row execute function public.set_updated_at();

alter table public.store_listing_reports enable row level security;
grant select on public.store_listing_reports to authenticated;
grant all on public.store_listing_reports to service_role;

drop policy if exists store_listing_reports_member_read on public.store_listing_reports;
create policy store_listing_reports_member_read on public.store_listing_reports
  for select to authenticated
  using (public.is_business_member(business_id));

create or replace function public.storefront_review_eligible(_order public.store_orders)
returns boolean
language sql immutable as $$
  select _order.fulfilment_status in ('completed', 'ready', 'out_for_delivery')
    and _order.payment_method <> 'quote';
$$;

create or replace function public.create_store_review(
  _slug text,
  _reference text,
  _token text,
  _product_id uuid,
  _rating integer,
  _body text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _store public.storefronts;
  _order public.store_orders;
  _item public.store_order_items;
  _name text;
  _text text;
  _id uuid;
begin
  if not public.check_rate_limit('store-review:' || coalesce(_slug, ''), 8, 60) then
    raise exception 'Too many reviews just now. Please wait a minute and try again.' using errcode = 'B0001';
  end if;
  select * into _store from public.storefronts where slug = lower(coalesce(_slug, '')) and status = 'published';
  if not found then
    raise exception 'This shop is not available.' using errcode = 'B0001';
  end if;
  select * into _order from public.store_orders
    where business_id = _store.business_id and reference = upper(btrim(coalesce(_reference, '')));
  if not found or _token is null or _order.token_hash <> extensions.crypt(_token, _order.token_hash) then
    raise exception 'That order could not be matched. Check the access code.' using errcode = 'B0001';
  end if;
  if not public.storefront_review_eligible(_order) then
    raise exception 'Reviews are only accepted after the shop marks the order ready, out for delivery, or completed. Quote requests cannot be reviewed.' using errcode = 'B0001';
  end if;
  if _rating is null or _rating < 1 or _rating > 5 then
    raise exception 'Choose a rating from 1 to 5.' using errcode = 'B0001';
  end if;
  select * into _item from public.store_order_items
    where order_id = _order.id and product_id = _product_id;
  if not found then
    raise exception 'That product was not on this order.' using errcode = 'B0001';
  end if;
  _text := public.storefront_plain(_body, 1000);
  if _text is null or length(_text) < 8 then
    raise exception 'Write a short review of what you received.' using errcode = 'B0001';
  end if;
  _name := public.storefront_plain(split_part(btrim(_order.customer_name), ' ', 1), 40);
  if _name is null or length(_name) < 2 then
    _name := 'Customer';
  end if;

  insert into public.store_reviews (
    business_id, product_id, order_id, rating, body, display_name
  ) values (
    _store.business_id, _product_id, _order.id, _rating, _text, _name
  ) returning id into _id;

  insert into public.notifications (business_id, type, title, message, severity, link)
  values (
    _store.business_id, 'store_review', 'Verified purchase review',
    _name || ' reviewed a product', 'info', '/storefront'
  );

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary)
  values (_store.business_id, null, 'store_review.created', 'store_review', _id, 'Verified purchase review');

  return jsonb_build_object('id', _id, 'status', 'published');
exception
  when unique_violation then
    raise exception 'You already reviewed this item on this order.' using errcode = 'B0001';
end;
$$;

create or replace function public.list_store_reviews(_slug text, _product_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _store public.storefronts;
  _count integer;
  _avg numeric;
  _reviews jsonb;
begin
  if not public.check_rate_limit('store-reviews-read:' || coalesce(_slug, ''), 60, 60) then
    raise exception 'Too many requests. Please wait a moment and try again.' using errcode = 'B0001';
  end if;
  select * into _store from public.storefronts where slug = lower(coalesce(_slug, '')) and status = 'published';
  if not found then
    return jsonb_build_object('count', 0, 'average', null, 'reviews', '[]'::jsonb);
  end if;
  select count(*)::int, avg(rating) into _count, _avg
    from public.store_reviews
    where business_id = _store.business_id and product_id = _product_id and status = 'published';
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'rating', r.rating,
    'body', r.body,
    'displayName', r.display_name,
    'createdAt', r.created_at,
    'verifiedPurchase', true
  ) order by r.created_at desc), '[]'::jsonb) into _reviews
    from public.store_reviews r
    where r.business_id = _store.business_id and r.product_id = _product_id and r.status = 'published';
  return jsonb_build_object(
    'count', coalesce(_count, 0),
    'average', case when coalesce(_count, 0) = 0 then null else round(_avg, 1) end,
    'reviews', _reviews
  );
end;
$$;

create or replace function public.list_store_reviews_admin(_business_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_business_member(_business_id) then
    raise exception 'You do not have access to this business.' using errcode = 'B0002';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id,
      'createdAt', r.created_at,
      'status', r.status,
      'rating', r.rating,
      'body', r.body,
      'displayName', r.display_name,
      'productName', coalesce(p.name, 'Product removed'),
      'orderReference', o.reference
    ) order by r.created_at desc)
    from public.store_reviews r
    left join public.products p on p.id = r.product_id
    left join public.store_orders o on o.id = r.order_id
    where r.business_id = _business_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.hide_store_review(
  _business_id uuid,
  _review_id uuid,
  _hidden boolean
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _row public.store_reviews;
begin
  if not public.is_business_member(_business_id) then
    raise exception 'You do not have access to this business.' using errcode = 'B0002';
  end if;
  select * into _row from public.store_reviews
    where id = _review_id and business_id = _business_id;
  if not found then
    raise exception 'That review could not be found.' using errcode = 'B0001';
  end if;
  update public.store_reviews
    set status = case when _hidden then 'hidden' else 'published' end
    where id = _review_id;
  return public.list_store_reviews_admin(_business_id);
end;
$$;

create or replace function public.create_listing_report(
  _slug text,
  _product_id uuid,
  _reason text,
  _detail text,
  _contact text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _store public.storefronts;
  _body text;
  _contact_clean text;
  _id uuid;
  _listing_ok boolean;
begin
  if not public.check_rate_limit('store-listing-report:' || coalesce(_slug, ''), 6, 60) then
    raise exception 'Too many reports just now. Please wait a minute and try again.' using errcode = 'B0001';
  end if;
  select * into _store from public.storefronts where slug = lower(coalesce(_slug, '')) and status = 'published';
  if not found then
    raise exception 'This shop is not available.' using errcode = 'B0001';
  end if;
  if _reason not in ('misleading', 'prohibited', 'spam', 'other') then
    raise exception 'Choose a report reason.' using errcode = 'B0001';
  end if;
  _body := public.storefront_plain(_detail, 2000);
  if _body is null or length(_body) < 8 then
    raise exception 'Describe the problem in a bit more detail.' using errcode = 'B0001';
  end if;
  _contact_clean := nullif(public.storefront_plain(_contact, 120), '');
  if _product_id is not null then
    select exists (
      select 1 from public.product_listings l
      where l.business_id = _store.business_id and l.product_id = _product_id and l.published
    ) into _listing_ok;
    if not _listing_ok then
      raise exception 'That listing is not on this shop.' using errcode = 'B0001';
    end if;
  end if;

  insert into public.store_listing_reports (
    business_id, product_id, reason, detail, reporter_contact
  ) values (
    _store.business_id, _product_id, _reason, _body, _contact_clean
  ) returning id into _id;

  insert into public.notifications (business_id, type, title, message, severity, link)
  values (
    _store.business_id, 'store_listing_report', 'Listing report',
    'Someone reported a listing', 'warning', '/storefront'
  );

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary)
  values (_store.business_id, null, 'store_listing_report.created', 'store_listing_report', _id, 'Listing report');

  return jsonb_build_object('id', _id, 'status', 'open');
end;
$$;

create or replace function public.list_listing_reports(_business_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_business_member(_business_id) then
    raise exception 'You do not have access to this business.' using errcode = 'B0002';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id,
      'createdAt', r.created_at,
      'status', r.status,
      'reason', r.reason,
      'detail', r.detail,
      'reporterContact', r.reporter_contact,
      'merchantNote', r.merchant_note,
      'productName', p.name
    ) order by r.created_at desc)
    from public.store_listing_reports r
    left join public.products p on p.id = r.product_id
    where r.business_id = _business_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.respond_listing_report(
  _business_id uuid,
  _report_id uuid,
  _status text,
  _note text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _row public.store_listing_reports;
begin
  if not public.is_business_member(_business_id) then
    raise exception 'You do not have access to this business.' using errcode = 'B0002';
  end if;
  if _status not in ('open', 'reviewing', 'resolved') then
    raise exception 'That report status is not valid.' using errcode = 'B0001';
  end if;
  select * into _row from public.store_listing_reports
    where id = _report_id and business_id = _business_id;
  if not found then
    raise exception 'That report could not be found.' using errcode = 'B0001';
  end if;
  update public.store_listing_reports
    set status = _status, merchant_note = nullif(public.storefront_plain(_note, 2000), '')
    where id = _report_id;
  return public.list_listing_reports(_business_id);
end;
$$;

create or replace function public.get_store_order(
  _slug text,
  _reference text,
  _token text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _store public.storefronts;
  _order public.store_orders;
  _items jsonb;
  _eligible boolean;
begin
  if not public.check_rate_limit('store-order-read:' || coalesce(_reference, ''), 30, 60) then
    raise exception 'Too many attempts. Please wait a moment and try again.' using errcode = 'B0001';
  end if;
  select * into _store from public.storefronts where slug = lower(coalesce(_slug, ''));
  if not found then
    raise exception 'That order could not be found.' using errcode = 'B0001';
  end if;
  select * into _order from public.store_orders
    where business_id = _store.business_id and reference = upper(btrim(coalesce(_reference, '')));
  if not found or _token is null or _order.token_hash <> extensions.crypt(_token, _order.token_hash) then
    raise exception 'That order could not be found.' using errcode = 'B0001';
  end if;
  _eligible := public.storefront_review_eligible(_order);
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', i.name,
    'quantity', i.quantity,
    'unitPrice', i.unit_price,
    'lineTotal', i.line_total,
    'note', i.note,
    'productId', i.product_id,
    'canReview', _eligible and i.product_id is not null and not exists (
      select 1 from public.store_reviews r
      where r.order_id = i.order_id and r.product_id = i.product_id
    ),
    'reviewed', exists (
      select 1 from public.store_reviews r
      where r.order_id = i.order_id and r.product_id = i.product_id
    )
  ) order by i.name), '[]'::jsonb) into _items
  from public.store_order_items i where i.order_id = _order.id;

  return jsonb_build_object(
    'reference', _order.reference,
    'storeName', _store.store_name,
    'fulfilmentStatus', _order.fulfilment_status,
    'paymentStatus', _order.payment_status,
    'paymentMethod', _order.payment_method,
    'fulfilmentMethod', _order.fulfilment_method,
    'customerName', _order.customer_name,
    'customerPhone', _order.customer_phone,
    'customerEmail', _order.customer_email,
    'customerAddress', _order.customer_address,
    'customerNotes', _order.customer_notes,
    'subtotal', _order.subtotal,
    'tax', _order.tax,
    'deliveryFee', _order.delivery_fee,
    'total', _order.total,
    'currency', _order.currency,
    'createdAt', _order.created_at,
    'items', _items,
    'paid', _order.payment_status = 'paid',
    'revenueRecorded', _order.sale_id is not null,
    'terms', coalesce(_order.terms, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.create_store_review(text, text, text, uuid, integer, text) from public;
revoke all on function public.list_store_reviews(text, uuid) from public;
revoke all on function public.list_store_reviews_admin(uuid) from public;
revoke all on function public.hide_store_review(uuid, uuid, boolean) from public;
revoke all on function public.create_listing_report(text, uuid, text, text, text) from public;
revoke all on function public.list_listing_reports(uuid) from public;
revoke all on function public.respond_listing_report(uuid, uuid, text, text) from public;
revoke all on function public.storefront_review_eligible(public.store_orders) from public;

grant execute on function public.create_store_review(text, text, text, uuid, integer, text) to anon, authenticated;
grant execute on function public.list_store_reviews(text, uuid) to anon, authenticated;
grant execute on function public.create_listing_report(text, uuid, text, text, text) to anon, authenticated;
grant execute on function public.list_store_reviews_admin(uuid) to authenticated;
grant execute on function public.hide_store_review(uuid, uuid, boolean) to authenticated;
grant execute on function public.list_listing_reports(uuid) to authenticated;
grant execute on function public.respond_listing_report(uuid, uuid, text, text) to authenticated;
