import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Keep manifest paths in sync with scripts/staging-manifest.mjs (duplicated list for vitest).
const FILES = [
  "20261020030000_product_media.sql",
  "20261021120000_manual_shop_payments.sql",
  "20261021140000_payment_proof_storage.sql",
  "20261021141000_platform_fx.sql",
  "20261021150000_storefront_template_library.sql",
  "20261022100000_storefront_content_sections.sql",
  "20261022110000_storefront_product_gallery.sql",
  "20261022120000_fix_store_order_notification_currency_precedence.sql",
  "20261022130000_allow_storefront_audit_actions.sql",
  "20261022140000_store_review_responses.sql",
  "20261023120000_payment_safety_foundation.sql",
  "20261023130000_platform_owner_foundation.sql",
  "20261023150000_growth_intelligence.sql",
  "20261026180000_billing_rpc_enforcement.sql",
  "20261027120000_admin_console_rpcs.sql",
  "20261027140000_admin_console_phase2.sql",
  "20261027160000_admin_console_phase3.sql",
  "20261027161000_platform_runtime_admin_columns.sql",
  "20261027170000_location_management_rpcs.sql",
  "20261027180000_store_launch_eligibility.sql",
  "20261027200000_customer_marketplace_hardening.sql",
  "20261027210000_order_fulfilment_stage6.sql",
  "20261027220000_order_notification_stage7.sql",
  "20261027230000_order_fulfilment_stage8.sql",
  "20261031080000_fix_outbox_branding.sql",
  "20261031090000_product_category_rpc.sql",
  "20261031163000_create_business_idempotent.sql",
  "20261102010000_fix_browse_marketplace_readonly.sql",
  "20261102120000_storefront_template_allowlist.sql",
  "20261102140000_morning_desk.sql",
  "20261102160000_split_tenders.sql",
  "20261102161000_create_sale_unique.sql",
  "20261102180000_notebook_delivery.sql",
  "20261102210000_whatsapp_channel.sql",
  "20261103080000_onboarding_journey.sql",
  "20261103020000_create_business_unique.sql",
];

describe("staging migration manifest", () => {
  it("lists migration files that exist on disk", () => {
    for (const file of FILES) {
      const path = join(process.cwd(), "supabase/migrations", file);
      expect(existsSync(path), `missing ${file}`).toBe(true);
      const sql = readFileSync(path, "utf8");
      expect(sql.length).toBeGreaterThan(20);
    }
  });

  it("installs notebook and delivery RPCs without rewriting create_sale", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations", "20261102180000_notebook_delivery.sql"),
      "utf8",
    );
    expect(sql).toContain("record_supplier_payment");
    expect(sql).toContain("take_customer_deposit");
    expect(sql).toContain("create_layby");
    expect(sql).toContain("collect_layby");
    expect(sql).toContain("storefront_attach_marketplace_verified");
    expect(sql).toContain("wholesale_price");
    expect(sql).not.toMatch(/create or replace function public\.create_sale\s*\(/);
  });

  it("installs a WhatsApp outbox channel without rewriting create_sale", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations", "20261102210000_whatsapp_channel.sql"),
      "utf8",
    );
    expect(sql).toContain("enqueue_shopper_order_whatsapp");
    expect(sql).toContain("record_order_messaging_opt_in");
    expect(sql).toContain("WhatsApp cannot be marked sent without a provider message id");
    expect(sql).not.toMatch(/create or replace function public\.create_sale\s*\(/);
    expect(sql).not.toMatch(/Meta Groups/i);
  });

  it("installs onboarding journey then keeps only the jsonb Create shop RPC", () => {
    const journey = readFileSync(
      join(process.cwd(), "supabase/migrations", "20261103080000_onboarding_journey.sql"),
      "utf8",
    );
    expect(journey).toContain("setup_completed_at");
    expect(journey).toContain("_onboarding_config jsonb");
  });

  it("drops leftover 7-arg create_business_with_owner so Create shop is unique", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations", "20261103020000_create_business_unique.sql"),
      "utf8",
    );
    expect(sql).toContain("pg_get_function_identity_arguments");
    expect(sql).toContain("%jsonb%");
    expect(sql).toContain("p.pronargs = 7");
    expect(sql).not.toMatch(/create or replace function public\.create_sale\s*\(/);
  });

  it("installs a save_storefront wrapper that accepts food-counter", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations",
        "20261102120000_storefront_template_allowlist.sql",
      ),
      "utf8",
    );
    expect(sql).toContain("food-counter");
    expect(sql).toContain("save_storefront_allowlist_base");
    expect(sql).toMatch(/\^https:\/\//);
  });
});
