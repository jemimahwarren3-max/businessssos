-- Records which Terms of Service / Privacy Policy version a user accepted
-- and when, per src/lib/legal-versions.ts. Written exclusively by
-- src/lib/legal-acceptance.server.ts using the service-role client (not the
-- user's own RLS-scoped one) — signUp() needs this to work even before
-- email confirmation, when there's no authenticated session yet to write
-- under. That also means a client can never insert its own row here, so the
-- record can't be forged — only ever read back by the user it belongs to.
create table public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  ip_address text,
  accepted_at timestamptz not null default now()
);
create index legal_acceptances_user_idx on public.legal_acceptances(user_id, accepted_at desc);

alter table public.legal_acceptances enable row level security;
grant select on public.legal_acceptances to authenticated;
grant all on public.legal_acceptances to service_role;

create policy "users read own acceptance" on public.legal_acceptances
  for select to authenticated using (user_id = auth.uid());
