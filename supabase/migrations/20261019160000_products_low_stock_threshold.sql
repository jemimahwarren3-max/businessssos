-- Ensure low_stock_threshold exists on products (base schema may predate staging).
alter table public.products
  add column if not exists low_stock_threshold integer not null default 5
    check (low_stock_threshold >= 0);
