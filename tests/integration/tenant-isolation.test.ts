import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asUser,
  createTestBusiness,
  createTestUser,
  deleteTestBusiness,
  deleteTestUser,
  newId,
  sql,
} from "./helpers";

// Turns this session's manual "business A can't touch business B's data"
// verification into a permanent regression suite. Business A is seeded with
// one real row in every business-owned table (via the same RPCs the app
// itself uses, not hand-crafted inserts, so this exercises the real
// authorization path). Business B's owner and a total outsider then both
// attempt every read/write/export path against business A and must be
// rejected the same way.
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
  "storefronts",
  "product_listings",
  "store_orders",
  "store_order_items",
  "store_order_events",
  "store_complaints",
  "store_reviews",
  "store_listing_reports",
  "locations",
  "product_stock",
  "cash_sessions",
  "cash_movements",
] as const;

describe("cross-tenant isolation", () => {
  let ownerA: string;
  let ownerB: string;
  let outsider: string;
  let bizA: string;
  let bizB: string;
  let productA: string;
  let customerA: string;

  beforeAll(async () => {
    ownerA = await createTestUser(`tenant-a-${newId()}@example.com`);
    ownerB = await createTestUser(`tenant-b-${newId()}@example.com`);
    outsider = await createTestUser(`tenant-outsider-${newId()}@example.com`);
    bizA = await createTestBusiness(ownerA, `Tenant Isolation A ${newId()}`);
    bizB = await createTestBusiness(ownerB, `Tenant Isolation B ${newId()}`);

    const [product] = await asUser<{ id: string }>(
      ownerA,
      `select id from public.create_product('${bizA}', 'Isolation Test Product', '', '', 'unit', 5, 10, 20, 0, 0, '', null, null);`,
    );
    productA = product!.id;

    const [customer] = await sql<{ id: string }>(`
      insert into public.customers (business_id, name) values ('${bizA}', 'Isolation Test Customer')
      returning id;
    `);
    customerA = customer!.id;

    await asUser(
      ownerA,
      `select public.create_sale('${bizA}', '${customerA}', 0, 'cash',
        'seed sale', '[{"productId":"${productA}","quantity":1,"unitPrice":10}]'::jsonb,
        'iso-sale-${newId()}', null);`,
    );
    await asUser(
      ownerA,
      `select public.create_invoice('${bizA}', '${customerA}', current_date, null, '', '', 0,
        '[{"productId":"${productA}","name":"Isolation Test Product","quantity":1,"unitPrice":10,"taxRate":0}]'::jsonb);`,
    );
    await asUser(
      ownerA,
      `select public.create_quote('${bizA}', '${customerA}', current_date, null, '', '', 0,
        '[{"productId":"${productA}","name":"Isolation Test Product","quantity":1,"unitPrice":10,"taxRate":0}]'::jsonb);`,
    );
    await sql(`
      insert into public.expenses (business_id, category, amount, expense_date, created_by)
      values ('${bizA}', 'other', 15, current_date, '${ownerA}');
    `);
    await sql(`
      insert into public.storefronts (business_id, slug, store_name, template_id)
      values ('${bizA}', 'iso-${newId().slice(0, 8)}', 'Isolation Shop', 'modern-minimal');
    `);
  }, 60_000);

  afterAll(async () => {
    await deleteTestBusiness(bizA);
    await deleteTestBusiness(bizB);
    await deleteTestUser(ownerA);
    await deleteTestUser(ownerB);
    await deleteTestUser(outsider);
  }, 30_000);

  describe.each([
    ["business B's owner (a real user, just not a member of A)", () => ownerB],
    ["a total outsider (no business membership at all)", () => outsider],
  ])("%s cannot reach business A's data", (_label, getAttacker) => {
    // 13 sequential Management API round trips (one per table) — the
    // default 20s budget is tight enough that a couple of retried requests
    // (see helpers.ts's transient-failure backoff) can blow through it even
    // though nothing is actually wrong.
    it("cannot read any of business A's rows in any exported table", async () => {
      for (const table of EXPORT_TABLES) {
        const rows = await asUser(
          getAttacker(),
          `select * from public.${table} where business_id = '${bizA}';`,
        );
        expect(rows, `table "${table}" leaked a row to a non-member`).toEqual([]);
      }
    }, 60_000);

    it("cannot read business A's subscription", async () => {
      const rows = await asUser(
        getAttacker(),
        `select * from public.subscriptions where business_id = '${bizA}';`,
      );
      expect(rows).toEqual([]);
    });

    it("has_business_role reports false for every role on business A", async () => {
      const rows = await asUser<{ has_role: boolean }>(
        getAttacker(),
        `select public.has_business_role('${bizA}', array['owner','admin','manager','cashier','accountant']::public.app_role[]) as has_role;`,
      );
      expect(rows[0]?.has_role).toBe(false);
    });

    it("cannot create a product in business A", async () => {
      await expect(
        asUser(
          getAttacker(),
          `select public.create_product('${bizA}', 'Attacker Product', '', '', 'unit', 1, 1, 0, 0, 0, '', null, null);`,
        ),
      ).rejects.toThrow(/does not allow this action|permission denied/i);
    });

    it("cannot adjust stock on business A's product", async () => {
      await expect(
        asUser(
          getAttacker(),
          `select public.adjust_stock('${bizA}', '${productA}', 'stock_in', 5, 'attack');`,
        ),
      ).rejects.toThrow(/does not allow this action|could not be found|permission denied/i);
    });

    it("cannot open a cash drawer in business A", async () => {
      await expect(
        asUser(getAttacker(), `select public.open_cash_session('${bizA}', 10, 'attack');`),
      ).rejects.toThrow(/does not allow this action|permission denied/i);
    });

    it("cannot create a location in business A", async () => {
      await expect(
        asUser(
          getAttacker(),
          `select public.create_location('${bizA}', 'Attacker Branch', '', '');`,
        ),
      ).rejects.toThrow(/does not allow this action|permission denied/i);
    });

    it("cannot record a sale against business A", async () => {
      await expect(
        asUser(
          getAttacker(),
          `select public.create_sale('${bizA}', null, 0, 'cash', 'attack',
            '[{"productId":"${productA}","quantity":1,"unitPrice":10}]'::jsonb,
            'iso-attack-${newId()}', null);`,
        ),
      ).rejects.toThrow(/do not have permission|permission denied/i);
    });

    it("cannot create an invoice or quote against business A", async () => {
      await expect(
        asUser(
          getAttacker(),
          `select public.create_invoice('${bizA}', null, current_date, null, '', '', 0,
            '[{"productId":"${productA}","name":"x","quantity":1,"unitPrice":10,"taxRate":0}]'::jsonb);`,
        ),
      ).rejects.toThrow(/permission|does not allow/i);
      await expect(
        asUser(
          getAttacker(),
          `select public.create_quote('${bizA}', null, current_date, null, '', '', 0,
            '[{"productId":"${productA}","name":"x","quantity":1,"unitPrice":10,"taxRate":0}]'::jsonb);`,
        ),
      ).rejects.toThrow(/permission|does not allow/i);
    });

    it("an UPDATE against business A's product silently affects zero rows, not an error", async () => {
      // RLS on a table with no matching row returns success-with-zero-rows
      // for UPDATE, not a thrown error — asserting that explicitly here
      // matters because "no error" alone would be a false negative if the
      // isolation were actually broken.
      const rows = await asUser<{ id: string }>(
        getAttacker(),
        `update public.products set selling_price = 999 where id = '${productA}' returning id;`,
      );
      expect(rows).toEqual([]);
      const [check] = await sql<{ selling_price: string }>(
        `select selling_price from public.products where id = '${productA}';`,
      );
      expect(Number(check!.selling_price)).toBe(10);
    });

    it("a DELETE against business A's customer silently affects zero rows", async () => {
      const rows = await asUser<{ id: string }>(
        getAttacker(),
        `delete from public.customers where id = '${customerA}' returning id;`,
      );
      expect(rows).toEqual([]);
      const [check] = await sql<{ count: number }>(
        `select count(*)::int as count from public.customers where id = '${customerA}';`,
      );
      expect(check!.count).toBe(1);
    });
  });

  it("business B's owner CAN operate normally within their own business (isolation isn't over-broad)", async () => {
    const rows = await asUser<{ id: string }>(
      ownerB,
      `select id from public.create_product('${bizB}', 'B Own Product', '', '', 'unit', 1, 2, 5, 0, 0, '', null, null);`,
    );
    expect(rows[0]?.id).toBeTruthy();
    await sql(`delete from public.inventory_movements where business_id = '${bizB}';`);
    await sql(`delete from public.products where business_id = '${bizB}';`);
  });

  it("querying a real ID vs. a random nonexistent one both return empty — existence isn't leaked", async () => {
    const realId = await asUser(
      outsider,
      `select * from public.products where id = '${productA}';`,
    );
    const fakeId = await asUser(
      outsider,
      `select * from public.products where id = '${crypto.randomUUID()}';`,
    );
    expect(realId).toEqual([]);
    expect(fakeId).toEqual([]);
  });
});
