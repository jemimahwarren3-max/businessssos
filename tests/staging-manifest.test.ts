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
});
