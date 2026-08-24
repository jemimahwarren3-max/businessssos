-- Platform-admin data access, for a single hardcoded operator account (see
-- src/lib/admin/). There is no "admin" role or table anywhere in this
-- schema — authorization lives entirely in application code as an
-- environment variable (PLATFORM_ADMIN_USER_ID), checked before any of
-- these functions are ever called. These functions themselves are grantable
-- only to service_role, same as paynow_confirm_payment — an authenticated
-- user's own RLS-scoped session can never call them directly, no matter
-- what the app-layer check does.
--
-- Deliberately scoped to businesses + subscriptions + subscription_payments
-- only — never sales, customers, invoices, or inventory. This is a billing
-- and platform-health tool, not a way to browse tenant data.
create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  business_id uuid references public.businesses(id) on delete set null,
  detail jsonb,
  created_at timestamptz not null default now()
);
grant all on public.admin_audit_log to service_role;
alter table public.admin_audit_log enable row level security;
-- No policies at all — RLS enabled with zero policies means every role
-- except service_role (which bypasses RLS) is denied entirely, including
-- read. Not even a business owner can see this table exists.

create or replace function public.admin_list_subscriptions()
returns table (
  business_id uuid,
  business_name text,
  business_type public.business_type,
  business_created_at timestamptz,
  plan public.plan_tier,
  status public.subscription_status,
  "interval" text,
  trial_ends_at timestamptz,
  current_period_end timestamptz
)
language sql stable security definer set search_path = public as $$
  select b.id, b.name, b.business_type, b.created_at,
         s.plan, s.status, s.interval, s.trial_ends_at, s.current_period_end
  from public.businesses b
  left join public.subscriptions s on s.business_id = b.id
  order by b.created_at desc;
$$;
revoke all on function public.admin_list_subscriptions() from public;
grant execute on function public.admin_list_subscriptions() to service_role;

create or replace function public.admin_list_payments(_limit int default 50)
returns table (
  reference text,
  business_id uuid,
  business_name text,
  plan public.plan_tier,
  "interval" text,
  amount numeric,
  currency text,
  status text,
  created_at timestamptz,
  paid_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select p.reference, p.business_id, b.name, p.plan, p.interval, p.amount,
         p.currency, p.status, p.created_at, p.paid_at
  from public.subscription_payments p
  join public.businesses b on b.id = p.business_id
  order by p.created_at desc
  limit greatest(_limit, 1);
$$;
revoke all on function public.admin_list_payments(int) from public;
grant execute on function public.admin_list_payments(int) to service_role;

create or replace function public.admin_platform_stats()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'businesses_total', (select count(*) from public.businesses),
    'businesses_by_status', (
      select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
      from (select status, count(*) n from public.subscriptions group by status) t
    ),
    'businesses_by_plan', (
      select coalesce(jsonb_object_agg(plan, n), '{}'::jsonb)
      from (select plan, count(*) n from public.subscriptions group by plan) t
    ),
    'signups_last_30_days', (
      select count(*) from public.businesses where created_at > now() - interval '30 days'
    ),
    'payments_paid_total', (
      select coalesce(sum(amount), 0) from public.subscription_payments where status = 'paid'
    ),
    'payments_paid_count', (
      select count(*) from public.subscription_payments where status = 'paid'
    ),
    'payments_failed_count', (
      select count(*) from public.subscription_payments where status = 'failed'
    ),
    'payments_stuck_count', (
      -- "created" and older than an hour — past any reasonable checkout window.
      select count(*) from public.subscription_payments
      where status = 'created' and created_at < now() - interval '1 hour'
    )
  );
$$;
revoke all on function public.admin_platform_stats() from public;
grant execute on function public.admin_platform_stats() to service_role;

create or replace function public.admin_override_subscription(
  _business_id uuid,
  _plan public.plan_tier,
  _status public.subscription_status,
  _current_period_end timestamptz,
  _reason text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.subscriptions
    set plan = _plan,
        status = _status,
        current_period_end = _current_period_end,
        updated_at = now()
    where business_id = _business_id;

  if not found then
    raise exception 'No subscription found for that business.' using errcode = 'B0001';
  end if;

  -- Deliberately no admin identity in a business-visible table — see the
  -- file header. The self-audit trail (with the reason you gave) lives only
  -- in admin_audit_log, which nothing but this operator account can read.
  insert into public.subscription_events (business_id, event_type, payload)
  values (_business_id, 'subscription.adjusted', jsonb_build_object('plan', _plan, 'status', _status));

  insert into public.admin_audit_log (action, business_id, detail)
  values (
    'override_subscription', _business_id,
    jsonb_build_object('plan', _plan, 'status', _status, 'current_period_end', _current_period_end, 'reason', _reason)
  );
end;
$$;
revoke all on function public.admin_override_subscription(uuid, public.plan_tier, public.subscription_status, timestamptz, text) from public;
grant execute on function public.admin_override_subscription(uuid, public.plan_tier, public.subscription_status, timestamptz, text) to service_role;
