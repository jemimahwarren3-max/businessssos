-- ============ enums ============
create type public.app_role as enum ('owner','admin','manager','cashier','accountant');
create type public.business_type as enum ('grocery','boutique','hardware','electronics','pharmacy','salon','restaurant','bakery','wholesale','services','other');
create type public.sale_status as enum ('completed','refunded','partially_refunded','cancelled');
create type public.doc_status as enum ('draft','sent','partially_paid','paid','overdue','cancelled');
create type public.quote_status as enum ('draft','sent','accepted','declined','expired','converted');
create type public.payment_method as enum ('cash','card','mobile_money','bank_transfer','credit');
create type public.movement_type as enum ('stock_in','stock_out','adjustment','return','sale','purchase');
create type public.plan_tier as enum ('free','starter','business','pro');
create type public.subscription_status as enum ('trialing','active','past_due','canceled','incomplete','unpaid');

-- ============ shared trigger ============
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

-- ============ profiles ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "own profile read" on public.profiles for select to authenticated using (id = auth.uid());
create policy "own profile insert" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'), new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ============ businesses ============
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  business_type public.business_type not null default 'other',
  currency text not null default 'USD' check (char_length(currency) between 3 and 3),
  address text,
  phone text,
  email text,
  logo_url text,
  default_tax_rate numeric(6,3) not null default 0 check (default_tax_rate >= 0 and default_tax_rate <= 100),
  invoice_prefix text not null default 'INV',
  quote_prefix text not null default 'QT',
  onboarding_completed boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'cashier',
  invited_by uuid references auth.users(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, user_id)
);
create index business_members_user_idx on public.business_members(user_id) where is_active;
create index business_members_business_idx on public.business_members(business_id);

grant select, insert, update, delete on public.businesses to authenticated;
grant all on public.businesses to service_role;
grant select, insert, update, delete on public.business_members to authenticated;
grant all on public.business_members to service_role;

-- security definer helpers (avoid RLS recursion)
create or replace function public.is_business_member(_business_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.business_members m
    where m.business_id = _business_id and m.user_id = auth.uid() and m.is_active);
$$;
create or replace function public.has_business_role(_business_id uuid, _roles public.app_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.business_members m
    where m.business_id = _business_id and m.user_id = auth.uid() and m.is_active and m.role = any(_roles));
$$;
create or replace function public.my_role(_business_id uuid)
returns public.app_role language sql stable security definer set search_path = public as $$
  select m.role from public.business_members m
  where m.business_id = _business_id and m.user_id = auth.uid() and m.is_active limit 1;
$$;
revoke all on function public.is_business_member(uuid) from public;
revoke all on function public.has_business_role(uuid, public.app_role[]) from public;
revoke all on function public.my_role(uuid) from public;
grant execute on function public.is_business_member(uuid) to authenticated, service_role;
grant execute on function public.has_business_role(uuid, public.app_role[]) to authenticated, service_role;
grant execute on function public.my_role(uuid) to authenticated, service_role;

alter table public.businesses enable row level security;
create policy "members read business" on public.businesses for select to authenticated using (public.is_business_member(id));
create policy "create own business" on public.businesses for insert to authenticated with check (created_by = auth.uid());
create policy "owners update business" on public.businesses for update to authenticated
  using (public.has_business_role(id, array['owner','admin']::public.app_role[]))
  with check (public.has_business_role(id, array['owner','admin']::public.app_role[]));
create policy "owners delete business" on public.businesses for delete to authenticated
  using (public.has_business_role(id, array['owner']::public.app_role[]));
create trigger businesses_updated before update on public.businesses for each row execute function public.set_updated_at();

alter table public.business_members enable row level security;
create policy "members read team" on public.business_members for select to authenticated
  using (user_id = auth.uid() or public.is_business_member(business_id));
create policy "bootstrap or admin add member" on public.business_members for insert to authenticated
  with check (
    public.has_business_role(business_id, array['owner','admin']::public.app_role[])
    or (user_id = auth.uid() and exists (select 1 from public.businesses b where b.id = business_id and b.created_by = auth.uid()))
  );
create policy "admins update member" on public.business_members for update to authenticated
  using (public.has_business_role(business_id, array['owner','admin']::public.app_role[]))
  with check (public.has_business_role(business_id, array['owner','admin']::public.app_role[]));
create policy "admins remove member" on public.business_members for delete to authenticated
  using (public.has_business_role(business_id, array['owner','admin']::public.app_role[]));
create trigger business_members_updated before update on public.business_members for each row execute function public.set_updated_at();

create table public.business_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0),
  allow_negative_stock boolean not null default false,
  invoice_terms text,
  invoice_notes text,
  receipt_footer text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.business_settings to authenticated;
grant all on public.business_settings to service_role;
alter table public.business_settings enable row level security;
create policy "members read settings" on public.business_settings for select to authenticated using (public.is_business_member(business_id));
create policy "admins write settings" on public.business_settings for insert to authenticated
  with check (public.has_business_role(business_id, array['owner','admin']::public.app_role[]));
create policy "admins update settings" on public.business_settings for update to authenticated
  using (public.has_business_role(business_id, array['owner','admin']::public.app_role[]))
  with check (public.has_business_role(business_id, array['owner','admin']::public.app_role[]));
create trigger business_settings_updated before update on public.business_settings for each row execute function public.set_updated_at();

-- ============ catalogue ============
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, name)
);
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  contact_person text,
  phone text,
  email text,
  address text,
  notes text,
  outstanding_amount numeric(14,2) not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index suppliers_business_idx on public.suppliers(business_id) where deleted_at is null;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  sku text,
  barcode text,
  category_id uuid references public.categories(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  description text,
  image_url text,
  cost_price numeric(14,2) not null default 0 check (cost_price >= 0),
  selling_price numeric(14,2) not null default 0 check (selling_price >= 0),
  stock numeric(14,3) not null default 0,
  min_stock numeric(14,3) not null default 0 check (min_stock >= 0),
  tax_rate numeric(6,3) not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  unit text not null default 'unit',
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index products_business_sku_uniq on public.products(business_id, lower(sku)) where sku is not null and deleted_at is null;
create index products_business_idx on public.products(business_id) where deleted_at is null;
create index products_business_name_idx on public.products(business_id, lower(name));
create index products_barcode_idx on public.products(business_id, barcode);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  phone text,
  email text,
  address text,
  notes text,
  outstanding_balance numeric(14,2) not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customers_business_idx on public.customers(business_id) where deleted_at is null;
create index customers_business_name_idx on public.customers(business_id, lower(name));

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  movement_type public.movement_type not null,
  quantity numeric(14,3) not null check (quantity <> 0),
  stock_before numeric(14,3) not null,
  stock_after numeric(14,3) not null,
  reason text,
  reference_type text,
  reference_id uuid,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index inventory_movements_product_idx on public.inventory_movements(business_id, product_id, created_at desc);

-- ============ sales ============
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  sale_number text not null,
  customer_id uuid references public.customers(id) on delete set null,
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  tax numeric(14,2) not null default 0 check (tax >= 0),
  total numeric(14,2) not null default 0 check (total >= 0),
  amount_paid numeric(14,2) not null default 0 check (amount_paid >= 0),
  cost_total numeric(14,2) not null default 0 check (cost_total >= 0),
  payment_method public.payment_method not null default 'cash',
  status public.sale_status not null default 'completed',
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, sale_number)
);
create index sales_business_date_idx on public.sales(business_id, created_at desc);
create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null,
  sku text,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  cost_price numeric(14,2) not null default 0 check (cost_price >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  tax numeric(14,2) not null default 0 check (tax >= 0),
  line_total numeric(14,2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);
create index sale_items_sale_idx on public.sale_items(sale_id);

-- ============ invoices / quotes ============
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  invoice_number text not null,
  customer_id uuid references public.customers(id) on delete set null,
  issue_date date not null default current_date,
  due_date date,
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  tax numeric(14,2) not null default 0 check (tax >= 0),
  total numeric(14,2) not null default 0 check (total >= 0),
  amount_paid numeric(14,2) not null default 0 check (amount_paid >= 0),
  status public.doc_status not null default 'draft',
  notes text,
  terms text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, invoice_number)
);
create index invoices_business_status_idx on public.invoices(business_id, status, due_date);
create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  tax numeric(14,2) not null default 0 check (tax >= 0),
  line_total numeric(14,2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);
create index invoice_items_invoice_idx on public.invoice_items(invoice_id);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  quote_number text not null,
  customer_id uuid references public.customers(id) on delete set null,
  issue_date date not null default current_date,
  valid_until date,
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  tax numeric(14,2) not null default 0 check (tax >= 0),
  total numeric(14,2) not null default 0 check (total >= 0),
  status public.quote_status not null default 'draft',
  notes text,
  terms text,
  converted_invoice_id uuid references public.invoices(id) on delete set null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, quote_number)
);
create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  tax numeric(14,2) not null default 0 check (tax >= 0),
  line_total numeric(14,2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);
create index quote_items_quote_idx on public.quote_items(quote_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  sale_id uuid references public.sales(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  amount numeric(14,2) not null check (amount > 0),
  method public.payment_method not null default 'cash',
  reference text,
  idempotency_key text,
  paid_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create unique index payments_idempotency_uniq on public.payments(business_id, idempotency_key) where idempotency_key is not null;
create index payments_business_date_idx on public.payments(business_id, paid_at desc);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  category text not null default 'other',
  description text,
  amount numeric(14,2) not null check (amount > 0),
  expense_date date not null default current_date,
  method public.payment_method not null default 'cash',
  vendor text,
  receipt_url text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index expenses_business_date_idx on public.expenses(business_id, expense_date desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  message text,
  severity text not null default 'info',
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_business_idx on public.notifications(business_id, created_at desc);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  summary text,
  old_values jsonb,
  new_values jsonb,
  ip_address text,
  user_agent text,
  result text not null default 'success',
  created_at timestamptz not null default now()
);
create index audit_logs_business_idx on public.audit_logs(business_id, created_at desc);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete cascade,
  plan public.plan_tier not null default 'free',
  status public.subscription_status not null default 'trialing',
  provider text not null default 'local',
  provider_customer_id text,
  provider_subscription_id text,
  interval text not null default 'month',
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  event_type text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

-- ============ grants + RLS for business-owned tables ============
do $$
declare t text;
begin
  foreach t in array array['categories','suppliers','products','customers','inventory_movements','sales','sale_items','invoices','invoice_items','quotes','quote_items','payments','expenses','notifications','audit_logs','subscriptions','subscription_events']
  loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "members read %1$s" on public.%1$I for select to authenticated using (public.is_business_member(business_id))', t);
  end loop;
end $$;

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['categories','suppliers','products','customers','sales','invoices','quotes','expenses','subscriptions']
  loop
    execute format('create trigger %1$s_updated before update on public.%1$I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- write policies: staff = owner/admin/manager, sales-capable = + cashier, finance = + accountant
create policy "staff manage categories" on public.categories for all to authenticated
  using (public.has_business_role(business_id, array['owner','admin','manager']::public.app_role[]))
  with check (public.has_business_role(business_id, array['owner','admin','manager']::public.app_role[]));
create policy "staff manage suppliers" on public.suppliers for all to authenticated
  using (public.has_business_role(business_id, array['owner','admin','manager']::public.app_role[]))
  with check (public.has_business_role(business_id, array['owner','admin','manager']::public.app_role[]));
create policy "staff manage products" on public.products for all to authenticated
  using (public.has_business_role(business_id, array['owner','admin','manager']::public.app_role[]))
  with check (public.has_business_role(business_id, array['owner','admin','manager']::public.app_role[]));
create policy "team manage customers" on public.customers for all to authenticated
  using (public.has_business_role(business_id, array['owner','admin','manager','cashier','accountant']::public.app_role[]))
  with check (public.has_business_role(business_id, array['owner','admin','manager','cashier','accountant']::public.app_role[]));
create policy "staff record movements" on public.inventory_movements for insert to authenticated
  with check (public.has_business_role(business_id, array['owner','admin','manager','cashier']::public.app_role[]));

create policy "team create sales" on public.sales for insert to authenticated
  with check (public.has_business_role(business_id, array['owner','admin','manager','cashier']::public.app_role[]));
create policy "staff update sales" on public.sales for update to authenticated
  using (public.has_business_role(business_id, array['owner','admin','manager']::public.app_role[]))
  with check (public.has_business_role(business_id, array['owner','admin','manager']::public.app_role[]));
create policy "admins delete sales" on public.sales for delete to authenticated
  using (public.has_business_role(business_id, array['owner','admin']::public.app_role[]));
create policy "team create sale items" on public.sale_items for insert to authenticated
  with check (public.has_business_role(business_id, array['owner','admin','manager','cashier']::public.app_role[]));

create policy "finance manage invoices" on public.invoices for all to authenticated
  using (public.has_business_role(business_id, array['owner','admin','manager','accountant']::public.app_role[]))
  with check (public.has_business_role(business_id, array['owner','admin','manager','accountant']::public.app_role[]));
create policy "finance manage invoice items" on public.invoice_items for all to authenticated
  using (public.has_business_role(business_id, array['owner','admin','manager','accountant']::public.app_role[]))
  with check (public.has_business_role(business_id, array['owner','admin','manager','accountant']::public.app_role[]));
create policy "finance manage quotes" on public.quotes for all to authenticated
  using (public.has_business_role(business_id, array['owner','admin','manager','accountant']::public.app_role[]))
  with check (public.has_business_role(business_id, array['owner','admin','manager','accountant']::public.app_role[]));
create policy "finance manage quote items" on public.quote_items for all to authenticated
  using (public.has_business_role(business_id, array['owner','admin','manager','accountant']::public.app_role[]))
  with check (public.has_business_role(business_id, array['owner','admin','manager','accountant']::public.app_role[]));
create policy "finance record payments" on public.payments for insert to authenticated
  with check (public.has_business_role(business_id, array['owner','admin','manager','cashier','accountant']::public.app_role[]));
create policy "admins adjust payments" on public.payments for delete to authenticated
  using (public.has_business_role(business_id, array['owner','admin']::public.app_role[]));
create policy "finance manage expenses" on public.expenses for all to authenticated
  using (public.has_business_role(business_id, array['owner','admin','manager','accountant']::public.app_role[]))
  with check (public.has_business_role(business_id, array['owner','admin','manager','accountant']::public.app_role[]));

drop policy "members read notifications" on public.notifications;
create policy "members read own notifications" on public.notifications for select to authenticated
  using (public.is_business_member(business_id) and (user_id is null or user_id = auth.uid()));
create policy "members update own notifications" on public.notifications for update to authenticated
  using (public.is_business_member(business_id) and (user_id is null or user_id = auth.uid()))
  with check (public.is_business_member(business_id) and (user_id is null or user_id = auth.uid()));

create policy "members append audit" on public.audit_logs for insert to authenticated
  with check (public.is_business_member(business_id) and user_id = auth.uid());
