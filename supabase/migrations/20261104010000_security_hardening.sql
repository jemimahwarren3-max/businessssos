-- Fix #2: get_setup_progress has no auth check — any authenticated user
-- can enumerate another business's counts. Add membership verification.

create or replace function public.get_setup_progress(_business_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.business_members
    where business_id = _business_id and user_id = auth.uid() and is_active
  ) then
    raise exception 'Not a member of this business.' using errcode = 'B0020';
  end if;

  return (
    select jsonb_build_object(
      'business_path', b.business_path,
      'setup_completed_at', b.setup_completed_at,
      'has_products', (select count(*) > 0 from public.products where business_id = _business_id),
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

-- Fix #4: Validate onboarding config size (prevent oversized payloads).
create or replace function public.save_onboarding_config(
  _business_id uuid,
  _config jsonb
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.business_members
    where business_id = _business_id and user_id = auth.uid() and role = 'owner'
  ) then
    raise exception 'Only the business owner can update onboarding config.' using errcode = 'B0011';
  end if;

  if octet_length(_config::text) > 8192 then
    raise exception 'Onboarding config too large.' using errcode = 'B0012';
  end if;

  update public.businesses
  set onboarding_config = _config
  where id = _business_id;
end;
$$;

-- Fix #18-21: Missing indexes for RLS performance on newer tables.
create index if not exists idx_customer_deposits_business_id
  on public.customer_deposits (business_id);

create index if not exists idx_laybys_business_id
  on public.laybys (business_id);

create index if not exists idx_layby_items_layby_id
  on public.layby_items (layby_id);

create index if not exists idx_layby_instalments_layby_id
  on public.layby_instalments (layby_id);
