-- Repair: admin_get_runtime referenced columns from earlier admin migrations
-- that were not applied yet (e.g. phase 2 run before phase 1).

alter table public.platform_runtime
  add column if not exists public_announcement text,
  add column if not exists announcement_enabled boolean not null default false,
  add column if not exists marketing_hero_title text,
  add column if not exists marketing_hero_subtitle text,
  add column if not exists courier_ops_notes text,
  add column if not exists sms_ops_notes text;

create or replace function public.admin_get_runtime()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'billing_enforced', coalesce(r.billing_enforced, false),
    'updated_at', r.updated_at,
    'public_announcement', coalesce(r.public_announcement, ''),
    'announcement_enabled', coalesce(r.announcement_enabled, false),
    'marketing_hero_title', coalesce(r.marketing_hero_title, ''),
    'marketing_hero_subtitle', coalesce(r.marketing_hero_subtitle, ''),
    'courier_ops_notes', coalesce(r.courier_ops_notes, ''),
    'sms_ops_notes', coalesce(r.sms_ops_notes, '')
  )
  from public.platform_runtime r
  where r.id = 1;
$$;
revoke all on function public.admin_get_runtime() from public, anon, authenticated;
grant execute on function public.admin_get_runtime() to service_role;
