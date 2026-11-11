-- Soft-delete products in bulk (recoverable only via support/DB; hidden from inventory).
create or replace function public.archive_products(
  _business_id uuid,
  _product_ids uuid[]
) returns table(archived_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  _count integer;
begin
  if not public.has_permission(_business_id, 'inventory.import') then
    raise exception 'You do not have permission to manage products.' using errcode = 'B0002';
  end if;

  if _product_ids is null or cardinality(_product_ids) = 0 then
    return query select 0;
    return;
  end if;

  if cardinality(_product_ids) > 500 then
    raise exception 'You can archive at most 500 products at once.' using errcode = 'B0002';
  end if;

  update public.product_listings
  set published = false, updated_at = now()
  where business_id = _business_id
    and product_id = any(_product_ids);

  update public.products
  set
    deleted_at = now(),
    is_active = false,
    updated_at = now()
  where business_id = _business_id
    and id = any(_product_ids)
    and deleted_at is null;

  get diagnostics _count = row_count;

  if _count > 0 then
    insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary, new_values)
    values (
      _business_id,
      auth.uid(),
      'products.archived',
      'product',
      null,
      'Archived ' || _count::text || ' product' || case when _count = 1 then '' else 's' end,
      jsonb_build_object('count', _count, 'product_ids', to_jsonb(_product_ids))
    );
  end if;

  return query select _count;
end;
$$;

revoke all on function public.archive_products(uuid, uuid[]) from public, anon;
grant execute on function public.archive_products(uuid, uuid[]) to authenticated;

alter table public.audit_logs drop constraint if exists audit_logs_action_check;
alter table public.audit_logs
  add constraint audit_logs_action_check check (
    action in (
      'business.created', 'product.created', 'products.imported', 'products.archived',
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
      'service.created', 'service.updated', 'booking.created',
      'platform_access.approved', 'platform_access.declined', 'platform_access.ended'
    )
  ) not valid;
