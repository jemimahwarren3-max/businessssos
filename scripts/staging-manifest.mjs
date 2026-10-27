/**
 * Ordered staging migrations applied by CI after storefront baseline exists.
 * skipIf: SQL that returns one row with column `skip` = true → file is not re-run.
 */
export const STAGING_MIGRATION_MANIFEST = [
  { file: "20261020030000_product_media.sql" },
  { file: "20261021120000_manual_shop_payments.sql" },
  { file: "20261021140000_payment_proof_storage.sql" },
  { file: "20261021141000_platform_fx.sql" },
  {
    file: "20261021150000_storefront_template_library.sql",
    skipIf: `
      select exists (
        select 1 from pg_constraint
        where conname = 'storefronts_theme_object_check'
      ) as skip
    `,
  },
  {
    file: "20261022100000_storefront_content_sections.sql",
    skipIf: `
      select exists (
        select 1 from pg_constraint
        where conname = 'storefronts_content_object_check'
      ) as skip
    `,
  },
  {
    file: "20261022110000_storefront_product_gallery.sql",
    skipIf: `
      select exists (
        select 1 from pg_constraint
        where conname = 'product_listings_gallery_urls_limit'
      ) as skip
    `,
  },
  { file: "20261022120000_fix_store_order_notification_currency_precedence.sql" },
  { file: "20261022130000_allow_storefront_audit_actions.sql" },
  { file: "20261022140000_store_review_responses.sql" },
  { file: "20261023120000_payment_safety_foundation.sql" },
  { file: "20261023130000_platform_owner_foundation.sql" },
  { file: "20261023150000_growth_intelligence.sql" },
  { file: "20261026180000_billing_rpc_enforcement.sql" },
  { file: "20261027120000_admin_console_rpcs.sql" },
  { file: "20261027140000_admin_console_phase2.sql" },
];

/** Readiness probes for master-checklist verification (staging). */
export const STAGING_READINESS_CHECKS = [
  {
    id: "storefronts",
    label: "Public storefronts table",
    sql: `select exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'storefronts'
    ) as ok`,
  },
  {
    id: "manual_payments",
    label: "Manual shop order payments",
    sql: `select exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'shop_order_payments'
    ) as ok`,
  },
  {
    id: "payment_safety",
    label: "Payment safety confirmations ledger",
    sql: `select exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'store_order_payment_confirmations'
    ) as ok`,
  },
  {
    id: "platform_owner",
    label: "Platform owner roles",
    sql: `select exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'platform_roles'
    ) as ok`,
  },
  {
    id: "bootstrap_platform_owner",
    label: "bootstrap_platform_owner() function",
    sql: `select exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'bootstrap_platform_owner'
    ) as ok`,
  },
  {
    id: "growth_events",
    label: "Storefront analytics events",
    sql: `select exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'storefront_analytics_events'
    ) as ok`,
  },
  {
    id: "product_media_bucket",
    label: "product-media storage bucket",
    sql: `select exists (
      select 1 from storage.buckets where id = 'product-media'
    ) as ok`,
  },
  {
    id: "create_business_with_owner",
    label: "create_business_with_owner() (not deprecated bootstrap_business_subscription)",
    sql: `select exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'create_business_with_owner'
    ) as ok`,
  },
];
