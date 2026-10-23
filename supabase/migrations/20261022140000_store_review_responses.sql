-- Adds public merchant responses to verified storefront reviews.
alter table public.store_reviews
  add column if not exists merchant_response text,
  add column if not exists merchant_responded_at timestamptz;

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
      'store_complaint.created', 'store_review.created', 'store_review.responded',
      'store_listing_report.created',
      'location.created', 'location.updated', 'location.deactivated',
      'cash_session.opened', 'cash_session.closed', 'cash.pay_in', 'cash.pay_out'
    )
  );

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
  select * into _store from public.storefronts
    where slug = lower(coalesce(_slug, '')) and status = 'published';
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
    'verifiedPurchase', true,
    'merchantResponse', r.merchant_response,
    'merchantRespondedAt', r.merchant_responded_at
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
      'orderReference', o.reference,
      'merchantResponse', r.merchant_response,
      'merchantRespondedAt', r.merchant_responded_at
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
  if not public.has_permission(_business_id, 'business.settings') then
    raise exception 'You do not have permission to manage storefront reviews.' using errcode = 'B0002';
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

create or replace function public.respond_store_review(
  _business_id uuid,
  _review_id uuid,
  _response text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _text text;
begin
  if not public.has_permission(_business_id, 'business.settings') then
    raise exception 'You do not have permission to manage storefront reviews.' using errcode = 'B0002';
  end if;
  if not exists (
    select 1 from public.store_reviews where id = _review_id and business_id = _business_id
  ) then
    raise exception 'That review could not be found.' using errcode = 'B0001';
  end if;
  _text := public.storefront_plain(_response, 1000);
  if _text is null or length(_text) < 2 then
    raise exception 'Write a response of at least 2 characters.' using errcode = 'B0001';
  end if;

  update public.store_reviews
    set merchant_response = _text, merchant_responded_at = now()
    where id = _review_id and business_id = _business_id;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary)
  values (
    _business_id, auth.uid(), 'store_review.responded', 'store_review', _review_id,
    'Merchant responded to a verified purchase review'
  );

  return public.list_store_reviews_admin(_business_id);
end;
$$;

revoke all on function public.respond_store_review(uuid, uuid, text) from public;
grant execute on function public.respond_store_review(uuid, uuid, text) to authenticated;
