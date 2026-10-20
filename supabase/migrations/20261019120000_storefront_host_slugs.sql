-- Shop addresses are {slug}.{platform host}. These labels must stay free so
-- they cannot shadow the app, the marketplace, or mail and CDN hosts.
-- Existing shop slugs are not rewritten.

create or replace function public.storefront_reserved_slug(_slug text)
returns boolean
language sql immutable as $$
  select _slug in (
    'admin', 'api', 'auth', 'dashboard', 'store', 'stores', 'settings', 'help',
    'legal', 'health', 'invite', 'staff-login', 'reset-password', 'sitemap',
    'robots', 'assets', 'public', 'login', 'signup', 'billing', 'onboarding',
    'sales', 'inventory', 'invoices', 'quotes', 'customers', 'expenses',
    'reports', 'insights', 'assistant', 'suppliers', 'commission', 'storefront',
    'account', 'checkout', 'cart', 'search', 'order', 'products',
    'www', 'app', 'market', 'mail', 'cdn', 'static', 'staging'
  );
$$;
