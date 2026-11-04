-- Close the get_setup_progress tenant-read hole: SECURITY DEFINER was granted
-- to every authenticated user with no membership check, unlike the write RPCs
-- in the same onboarding journey file.

create or replace function public.get_setup_progress(_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_business_member(_business_id) then
    raise exception 'Not a member of this business.' using errcode = 'B0013';
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

revoke all on function public.get_setup_progress(uuid) from public, anon;
grant execute on function public.get_setup_progress(uuid) to authenticated;
