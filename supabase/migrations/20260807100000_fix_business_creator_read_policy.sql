-- `INSERT ... RETURNING` (used by createBusinessRecord's .insert().select("id"))
-- requires the row to also pass the table's SELECT policy, not just INSERT's
-- WITH CHECK. The creator isn't a member yet at that point (business_members
-- is inserted right after), so the original is_business_member(id)-only
-- policy blocked the very first read of a business a user just created.
drop policy if exists "members read business" on public.businesses;
create policy "members read business" on public.businesses
  for select to authenticated
  using (public.is_business_member(id) or created_by = auth.uid());
