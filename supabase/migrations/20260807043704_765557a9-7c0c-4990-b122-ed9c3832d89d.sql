revoke all on function public.is_business_member(uuid) from anon;
revoke all on function public.has_business_role(uuid, public.app_role[]) from anon;
revoke all on function public.my_role(uuid) from anon;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;