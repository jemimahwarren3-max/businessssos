import type { Json } from "@/integrations/supabase/types";
import { AppError, assertPermission, dbFail, recordAudit, type Db } from "./business.server";

// Generous — far beyond what this app's target market (small/growing
// businesses) would produce in any single table over years of use — but
// bounds worst-case memory/time on a single request. Rejecting outright
// beats silently truncating: a truncated export is an incomplete backup
// the user has no way to notice, which is worse than an honest error.
export const EXPORT_ROW_CAP = 100_000;

/** Pure — split out so the reject-on-overflow branch is directly
 * unit-testable with fixture data (see tests/data-export-cap.test.ts)
 * instead of needing a live 100k-row seed. */
export function enforceExportRowCap<T>(table: string, rows: T[]): T[] {
  if (rows.length > EXPORT_ROW_CAP) {
    console.error(`[businessos] export row cap exceeded for table "${table}"`);
    throw new AppError(
      "This business has too much data for a single export right now. Please contact support.",
    );
  }
  return rows;
}

// Every business-owned table with operational (not billing-internal) data —
// exactly what a user would reasonably expect "export my data" to mean.
// Excludes notifications (ephemeral UI state) and subscriptions/payments
// (covered by the billing page's own payment history).
const EXPORT_TABLES = [
  "products",
  "categories",
  "suppliers",
  "customers",
  "sales",
  "sale_items",
  "invoices",
  "invoice_items",
  "quotes",
  "quote_items",
  "payments",
  "expenses",
  "inventory_movements",
  "locations",
  "product_stock",
  "cash_sessions",
  "cash_movements",
] as const;

export type BusinessExport = {
  exportedAt: string;
  business: Json;
} & Record<(typeof EXPORT_TABLES)[number], Json[]>;

export async function exportBusinessData(
  supabase: Db,
  userId: string,
  businessId: string,
): Promise<BusinessExport> {
  await assertPermission(supabase, businessId, "business.export_data");

  const { data: business, error: bizError } = await supabase
    .from("businesses")
    .select(
      "id, name, business_type, currency, address, phone, email, logo_url, default_tax_rate, invoice_prefix, quote_prefix, onboarding_completed, created_by, created_at, updated_at, staff_code",
    )
    .eq("id", businessId)
    .maybeSingle();
  if (bizError) dbFail("export business", bizError);

  const results = await Promise.all(
    EXPORT_TABLES.map((table) =>
      supabase
        .from(table)
        .select("*")
        .eq("business_id", businessId)
        .limit(EXPORT_ROW_CAP + 1),
    ),
  );

  const data = {} as Record<(typeof EXPORT_TABLES)[number], Json[]>;
  EXPORT_TABLES.forEach((table, index) => {
    const result = results[index]!;
    if (result.error) dbFail(`export ${table}`, result.error);
    data[table] = enforceExportRowCap(table, result.data ?? []) as Json[];
  });

  await recordAudit(supabase, {
    businessId,
    userId,
    action: "data.exported",
    entityType: "business",
    entityId: businessId,
    summary: "Exported all business data",
  });

  return { exportedAt: new Date().toISOString(), business: business as Json, ...data };
}
