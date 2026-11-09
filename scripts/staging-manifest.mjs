/**
 * Ordered staging migrations applied by CI after storefront baseline exists.
 * skipIf: SQL that returns one row with column `skip` = true → file is not re-run.
 */
export const STAGING_MIGRATION_MANIFEST = [
  {
    file: "20261019160000_products_low_stock_threshold.sql",
    skipIf: `
      select exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'products'
          and column_name = 'low_stock_threshold'
      ) as skip
    `,
  },
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
  { file: "20261027160000_admin_console_phase3.sql" },
  { file: "20261027161000_platform_runtime_admin_columns.sql" },
  { file: "20261027170000_location_management_rpcs.sql" },
  { file: "20261027180000_store_launch_eligibility.sql" },
  { file: "20261027200000_customer_marketplace_hardening.sql" },
  { file: "20261027210000_order_fulfilment_stage6.sql" },
  { file: "20261027220000_order_notification_stage7.sql" },
  { file: "20261027230000_order_fulfilment_stage8.sql" },
  { file: "20261031080000_fix_outbox_branding.sql" },
  {
    file: "20261031090000_product_category_rpc.sql",
    skipIf: `
      select exists (
        select 1 from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'create_product'
          and p.proargnames is not null
          and '_category_id' = any (p.proargnames)
      ) as skip
    `,
  },
  { file: "20261031163000_create_business_idempotent.sql" },
  { file: "20261102010000_fix_browse_marketplace_readonly.sql" },
  {
    file: "20261102120000_storefront_template_allowlist.sql",
    skipIf: `
      select exists (
        select 1 from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'save_storefront'
          and pg_get_functiondef(p.oid) like '%save_storefront_allowlist_base%'
      ) as skip
    `,
  },
  {
    file: "20261102140000_morning_desk.sql",
    skipIf: `
      select exists (
        select 1 from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'record_customer_credit_payment'
      ) as skip
    `,
  },
  {
    file: "20261102160000_split_tenders.sql",
    skipIf: `
      select exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'payments'
          and column_name = 'amount_original'
      ) as skip
    `,
  },
  {
    // Older manifest entries recreate 8-arg create_sale on every apply.
    // Always drop leftover overloads so 8-arg calls uniquely match Stage 2.
    file: "20261102161000_create_sale_unique.sql",
  },
  {
    file: "20261102180000_notebook_delivery.sql",
    skipIf: `
      select exists (
        select 1 from information_schema.tables
        where table_schema = 'public' and table_name = 'customer_deposits'
      ) as skip
    `,
  },
  {
    file: "20261102210000_whatsapp_channel.sql",
    skipIf: `
      select exists (
        select 1 from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'complete_notification_outbox'
          and pg_get_functiondef(p.oid) like '%provider message id%'
      ) as skip
    `,
  },
  {
    // Always re-apply: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE. Skipping
    // on setup_completed_at left staging without the jsonb Create shop RPC.
    file: "20261103080000_onboarding_journey.sql",
  },
  {
    // After the journey file, drop leftover 5-arg / timezone 7-arg overloads
    // so Create shop uniquely matches the jsonb signature.
    file: "20261103020000_create_business_unique.sql",
  },
  {
    file: "20261103100000_get_setup_progress_member.sql",
  },
  {
    file: "20261103120000_one_month_trial.sql",
  },
  {
    // Always re-apply: older manifest files recreate get_daily_takings
    // without excluding supplier payouts.
    file: "20261103121000_daily_takings_exclude_suppliers.sql",
  },
  { file: "20260817010000_team_invites.sql" },
  { file: "20261106130000_platform_access_consent.sql" },
  { file: "20261106150347_role_and_order_permissions.sql" },
  { file: "20261106151400_enforce_team_role_boundaries.sql" },
  { file: "20261106152808_historical_import_safety.sql" },
  { file: "20261109100000_stock_assistant_role.sql" },
  { file: "20261109110000_stock_assistant_permissions.sql" },
  { file: "20261109120000_cash_sale_auto_session.sql" },
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
  {
    id: "create_business_with_owner_unique",
    label: "create_business_with_owner() is a unique jsonb signature",
    sql: `select (
      (select count(*) from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'create_business_with_owner') = 1
    ) and exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'create_business_with_owner'
        and p.pronargs = 7
        and pg_get_function_identity_arguments(p.oid) like '%jsonb%'
    ) as ok`,
  },
  {
    id: "create_sale_tenders",
    label: "create_sale() is the unique 10-arg split-tenders function",
    sql: `select exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'create_sale'
        and p.proargnames is not null
        and '_tenders' = any (p.proargnames)
    ) and not exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'create_sale'
        and (p.proargnames is null or not ('_tenders' = any (p.proargnames)))
    ) as ok`,
  },
  {
    id: "daily_takings_exclude_suppliers",
    label: "get_daily_takings() excludes supplier payouts",
    sql: `select exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'get_daily_takings'
        and pg_get_functiondef(p.oid) like '%supplier_id is null%'
    ) as ok`,
  },
  {
    id: "one_month_trial",
    label: "create_business_with_owner() starts a 1-month trial",
    sql: `select exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'create_business_with_owner'
        and pg_get_functiondef(p.oid) like '%interval ''1 month''%'
    ) as ok`,
  },
  {
    id: "setup_completed_at",
    label: "businesses.setup_completed_at (setup vs create-shop)",
    sql: `select exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'businesses'
        and column_name = 'setup_completed_at'
    ) as ok`,
  },
  {
    id: "create_product_category",
    label: "create_product() accepts _category_id",
    sql: `select exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'create_product'
        and p.proargnames is not null
        and '_category_id' = any (p.proargnames)
    ) as ok`,
  },
  {
    id: "business_feature_flags",
    label: "get_business_feature_flags() (workspace load must not 404 onboarding)",
    sql: `select exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'get_business_feature_flags'
    ) as ok`,
  },
  {
    id: "storefront_template_allowlist",
    label: "save_storefront() accepts 60 website templates",
    sql: `select exists (
      select 1 from pg_constraint
      where conname = 'storefronts_template_check'
        and pg_get_constraintdef(oid) like '%food-counter%'
    ) as ok`,
  },
  {
    id: "get_setup_progress_member",
    label: "get_setup_progress() requires business membership",
    sql: `select exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'get_setup_progress'
        and pg_get_functiondef(p.oid) like '%is_business_member%'
    ) as ok`,
  },
];
