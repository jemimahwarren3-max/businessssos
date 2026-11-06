-- Platform support access needs the merchant's approval. An admin can only start
-- a session after an owner or admin of the business approves a request, and the
-- session ends when that approval expires or the merchant ends it. Enforced here,
-- so direct API calls cannot skip it.

create table if not exists public.platform_access_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  admin_user_id uuid not null references auth.users (id) on delete cascade,
  reason text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined', 'ended')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz,
  ended_at timestamptz,
  constraint platform_access_reason_len check (char_length(trim(reason)) >= 3)
);

create index if not exists platform_access_requests_business_idx
  on public.platform_access_requests (business_id, status);

alter table public.platform_access_requests enable row level security;

drop policy if exists "service role only access requests" on public.platform_access_requests;
create policy "service role only access requests"
  on public.platform_access_requests
  for all
  to service_role
  using (true)
  with check (true);

create or replace function public.can_manage_platform_access(_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.business_members m
    where m.business_id = _business_id
      and m.user_id = auth.uid()
      and m.is_active
      and m.role in ('owner', 'admin')
  );
$$;
revoke all on function public.can_manage_platform_access(uuid) from public, anon;
grant execute on function public.can_manage_platform_access(uuid) to authenticated, service_role;

create or replace function public.admin_request_business_access(
  _admin_user_id uuid,
  _business_id uuid,
  _reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _request_id uuid;
begin
  if not exists (select 1 from public.businesses b where b.id = _business_id) then
    raise exception 'Business not found.' using errcode = 'B0001';
  end if;

  select r.id into _request_id
  from public.platform_access_requests r
  where r.admin_user_id = _admin_user_id
    and r.business_id = _business_id
    and r.status = 'pending'
  order by r.requested_at desc
  limit 1;
  if _request_id is not null then
    return _request_id;
  end if;

  insert into public.platform_access_requests (business_id, admin_user_id, reason)
  values (_business_id, _admin_user_id, trim(_reason))
  returning id into _request_id;
  return _request_id;
end;
$$;
revoke all on function public.admin_request_business_access(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_request_business_access(uuid, uuid, text) to service_role;

create or replace function public.admin_get_business_access(_admin_user_id uuid, _business_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'requestId', r.id,
        'status',
          case
            when r.status = 'approved' and r.expires_at <= now() then 'expired'
            else r.status
          end,
        'expiresAt', r.expires_at,
        'decidedAt', r.decided_at
      )
      from public.platform_access_requests r
      where r.admin_user_id = _admin_user_id
        and r.business_id = _business_id
      order by r.requested_at desc
      limit 1
    ),
    jsonb_build_object('status', 'none')
  );
$$;
revoke all on function public.admin_get_business_access(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_get_business_access(uuid, uuid) to service_role;

create or replace function public.business_list_access_requests(_business_id uuid)
returns table (
  id uuid,
  reason text,
  status text,
  requested_at timestamptz,
  decided_at timestamptz,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_manage_platform_access(_business_id) then
    raise exception 'Only an owner or admin can see support access requests.' using errcode = 'B0002';
  end if;
  return query
    select r.id, r.reason,
      case
        when r.status = 'approved' and r.expires_at <= now() then 'expired'::text
        else r.status
      end,
      r.requested_at, r.decided_at, r.expires_at
    from public.platform_access_requests r
    where r.business_id = _business_id
    order by r.requested_at desc
    limit 20;
end;
$$;
revoke all on function public.business_list_access_requests(uuid) from public, anon;
grant execute on function public.business_list_access_requests(uuid) to authenticated, service_role;

create or replace function public.business_decide_access_request(
  _request_id uuid,
  _approve boolean,
  _hours int default 24
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _req public.platform_access_requests%rowtype;
begin
  select * into _req from public.platform_access_requests r where r.id = _request_id;
  if not found then
    raise exception 'Request not found.' using errcode = 'B0001';
  end if;
  if not public.can_manage_platform_access(_req.business_id) then
    raise exception 'Only an owner or admin can decide support access.' using errcode = 'B0002';
  end if;
  if _req.status <> 'pending' then
    raise exception 'This request is no longer pending.' using errcode = 'B0003';
  end if;

  if _approve then
    update public.platform_access_requests r
    set status = 'approved',
        decided_at = now(),
        decided_by = auth.uid(),
        expires_at = now() + (greatest(1, least(coalesce(_hours, 24), 72)) || ' hours')::interval
    where r.id = _request_id;
  else
    update public.platform_access_requests r
    set status = 'declined', decided_at = now(), decided_by = auth.uid()
    where r.id = _request_id;
  end if;
end;
$$;
revoke all on function public.business_decide_access_request(uuid, boolean, int) from public, anon;
grant execute on function public.business_decide_access_request(uuid, boolean, int) to authenticated, service_role;

create or replace function public.business_end_platform_access(_business_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  _count int;
begin
  if not public.can_manage_platform_access(_business_id) then
    raise exception 'Only an owner or admin can end support access.' using errcode = 'B0002';
  end if;

  update public.platform_impersonation_sessions s
  set ended_at = now()
  where s.business_id = _business_id
    and s.ended_at is null;

  update public.platform_access_requests r
  set status = 'ended', ended_at = now()
  where r.business_id = _business_id
    and r.status = 'approved';
  get diagnostics _count = row_count;
  return _count;
end;
$$;
revoke all on function public.business_end_platform_access(uuid) from public, anon;
grant execute on function public.business_end_platform_access(uuid) to authenticated, service_role;

-- Only an approved, unexpired request can open a session, and the session cannot
-- outlive the approval.
create or replace function public.admin_start_impersonation(
  _admin_user_id uuid,
  _business_id uuid,
  _reason text,
  _ttl_minutes int default 60
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _session_id uuid;
  _ttl int;
  _request_id uuid;
  _approval_expires timestamptz;
begin
  if not exists (select 1 from public.businesses b where b.id = _business_id) then
    raise exception 'Business not found.' using errcode = 'B0001';
  end if;

  select r.id, r.expires_at into _request_id, _approval_expires
  from public.platform_access_requests r
  where r.admin_user_id = _admin_user_id
    and r.business_id = _business_id
    and r.status = 'approved'
    and r.expires_at > now()
  order by r.decided_at desc
  limit 1;
  if _request_id is null then
    raise exception 'The merchant has not approved support access for this shop.' using errcode = 'B0004';
  end if;

  _ttl := greatest(5, least(coalesce(_ttl_minutes, 60), 240));

  update public.platform_impersonation_sessions s
  set ended_at = now()
  where s.admin_user_id = _admin_user_id
    and s.ended_at is null;

  insert into public.platform_impersonation_sessions (
    admin_user_id,
    business_id,
    reason,
    expires_at
  )
  values (
    _admin_user_id,
    _business_id,
    trim(_reason),
    least(now() + (_ttl || ' minutes')::interval, _approval_expires)
  )
  returning id into _session_id;

  return _session_id;
end;
$$;
revoke all on function public.admin_start_impersonation(uuid, uuid, text, int) from public, anon, authenticated;
grant execute on function public.admin_start_impersonation(uuid, uuid, text, int) to service_role;

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
      'service.created', 'service.updated', 'booking.created',
      'platform_access.approved', 'platform_access.declined', 'platform_access.ended'
    )
  );
