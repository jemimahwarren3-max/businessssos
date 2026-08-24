-- Supports Settings -> Account -> Delete Account (src/lib/account-deletion.server.ts).
-- Deletes every business this user solely owns (cascades to all of that
-- business's data automatically via the existing on-delete-cascade FKs), and
-- clears the handful of nullable auth.users references that would otherwise
-- block auth.admin.deleteUser() from removing the login afterward.
--
-- businesses.created_by has no cascade (deliberately — a business shouldn't
-- vanish just because whoever happened to create it is later removed by an
-- admin elsewhere), so the caller's own businesses must be deleted here
-- before their auth.users row can be deleted. business_members.invited_by
-- and the various *.created_by columns are nullable with no cascade either;
-- nulling them is a no-op today (no team-invite feature exists yet to ever
-- populate them for a business this user doesn't own) but prevents a real
-- FK-violation crash the day that feature ships.
create or replace function public.delete_owned_businesses()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_biz record;
begin
  if v_user_id is null then
    raise exception 'You must be signed in.' using errcode = 'B0002';
  end if;

  for v_biz in
    select b.id, b.name from public.businesses b
    join public.business_members m
      on m.business_id = b.id and m.user_id = v_user_id and m.is_active
    where m.role = 'owner'
  loop
    if exists (
      select 1 from public.business_members
      where business_id = v_biz.id and user_id <> v_user_id and is_active
    ) then
      raise exception 'Remove other team members from "%" before deleting your account.', v_biz.name
        using errcode = 'B0001';
    end if;
  end loop;

  delete from public.businesses b
  where b.id in (
    select m.business_id from public.business_members m
    where m.user_id = v_user_id and m.is_active and m.role = 'owner'
  );

  update public.business_members set invited_by = null where invited_by = v_user_id;
  update public.inventory_movements set created_by = null where created_by = v_user_id;
  update public.sales set created_by = null where created_by = v_user_id;
  update public.invoices set created_by = null where created_by = v_user_id;
  update public.quotes set created_by = null where created_by = v_user_id;
  update public.payments set created_by = null where created_by = v_user_id;
  update public.expenses set created_by = null where created_by = v_user_id;
end;
$$;
revoke all on function public.delete_owned_businesses() from public, anon, authenticated;
grant execute on function public.delete_owned_businesses() to authenticated;
