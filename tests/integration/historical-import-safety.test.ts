import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asUser,
  createTestBusiness,
  createTestUser,
  deleteTestBusiness,
  deleteTestUser,
  describeStaging,
  newId,
  sql,
} from "./helpers";

describeStaging("historical import safety", () => {
  let ownerId: string;
  let businessId: string;
  let productId: string;

  beforeAll(async () => {
    ownerId = await createTestUser(`historical-import-${newId()}@example.com`);
    businessId = await createTestBusiness(ownerId, `Historical import ${newId()}`);
    productId = newId();
    await sql(`
      insert into public.products (
        id, business_id, name, sku, cost_price, selling_price, stock, min_stock, unit
      ) values (
        '${productId}', '${businessId}', 'Historical test product', '${newId()}',
        1, 3, 5, 1, 'unit'
      );
    `);
  }, 60_000);

  afterAll(async () => {
    if (businessId) await deleteTestBusiness(businessId);
    if (ownerId) await deleteTestUser(ownerId);
  }, 30_000);

  it("imports detailed history idempotently without stock movement or notifications", async () => {
    const batchKey = "a".repeat(64);
    const rowNumber = 2;
    const [before] = await sql<{
      stock: number;
      movements: number;
      notifications: number;
      outbox: number;
    }>(`
      select
        p.stock,
        (select count(*) from public.inventory_movements where business_id = '${businessId}') as movements,
        (select count(*) from public.notifications where business_id = '${businessId}') as notifications,
        (select count(*) from public.notification_outbox where business_id = '${businessId}') as outbox
      from public.products p where p.id = '${productId}';
    `);

    const [firstImport] = await asUser<{ sale_id: string; imported: boolean }>(
      ownerId,
      `select * from public.import_historical_sale_line(
        '${businessId}', '2026-10-01T10:00:00Z', '${productId}', 2, 3, null,
        'cash', null, '${batchKey}', ${rowNumber}
      );`,
    );
    const [retry] = await asUser<{ sale_id: string; imported: boolean }>(
      ownerId,
      `select * from public.import_historical_sale_line(
        '${businessId}', '2026-10-01T10:00:00Z', '${productId}', 2, 3, null,
        'cash', null, '${batchKey}', ${rowNumber}
      );`,
    );

    expect(firstImport?.imported).toBe(true);
    expect(retry?.imported).toBe(false);
    expect(retry?.sale_id).toBe(firstImport?.sale_id);

    const [after] = await sql<{
      stock: number;
      movements: number;
      notifications: number;
      outbox: number;
      historical: boolean;
      sale_count: number;
      payment_historical: boolean;
      item_historical: boolean;
    }>(`
      select
        p.stock,
        (select count(*) from public.inventory_movements where business_id = '${businessId}') as movements,
        (select count(*) from public.notifications where business_id = '${businessId}') as notifications,
        (select count(*) from public.notification_outbox where business_id = '${businessId}') as outbox,
        s.is_historical as historical,
        (select count(*) from public.sales where business_id = '${businessId}' and import_batch_key = '${batchKey}') as sale_count,
        (select is_historical from public.payments where sale_id = s.id limit 1) as payment_historical,
        (select is_historical from public.sale_items where sale_id = s.id limit 1) as item_historical
      from public.products p
      join public.sales s on s.id = '${firstImport?.sale_id}'
      where p.id = '${productId}';
    `);
    expect(after?.stock).toBe(before?.stock);
    expect(after?.movements).toBe(before?.movements);
    expect(after?.notifications).toBe(before?.notifications);
    expect(after?.outbox).toBe(before?.outbox);
    expect(after?.historical).toBe(true);
    expect(after?.payment_historical).toBe(true);
    expect(after?.item_historical).toBe(true);
    expect(after?.sale_count).toBe(1);
  });

  it("imports summary sales and expenses once with historical flags", async () => {
    const salesBatch = "b".repeat(64);
    const expenseBatch = "c".repeat(64);
    const [summarySale] = await asUser<{ sale_id: string; imported: boolean }>(
      ownerId,
      `select * from public.import_historical_sale_total(
        '${businessId}', '2026-09-10T00:00:00Z', 20, 8, 'Historical summary',
        '${salesBatch}', 2
      );`,
    );
    const [summaryRetry] = await asUser<{ sale_id: string; imported: boolean }>(
      ownerId,
      `select * from public.import_historical_sale_total(
        '${businessId}', '2026-09-10T00:00:00Z', 20, 8, 'Historical summary',
        '${salesBatch}', 2
      );`,
    );
    const [expense] = await asUser<{ expense_id: string; imported: boolean }>(
      ownerId,
      `select * from public.import_historical_expense(
        '${businessId}', '2026-09-10', 'supplies', 'Historical expense', 5,
        'Test vendor', '${expenseBatch}', 2
      );`,
    );
    const [expenseRetry] = await asUser<{ expense_id: string; imported: boolean }>(
      ownerId,
      `select * from public.import_historical_expense(
        '${businessId}', '2026-09-10', 'supplies', 'Historical expense', 5,
        'Test vendor', '${expenseBatch}', 2
      );`,
    );

    expect(summarySale?.imported).toBe(true);
    expect(summaryRetry?.imported).toBe(false);
    expect(summaryRetry?.sale_id).toBe(summarySale?.sale_id);
    expect(expense?.imported).toBe(true);
    expect(expenseRetry?.imported).toBe(false);
    expect(expenseRetry?.expense_id).toBe(expense?.expense_id);

    const [flags] = await sql<{ sale_historical: boolean; expense_historical: boolean }>(`
      select
        (select is_historical from public.sales where id = '${summarySale?.sale_id}') as sale_historical,
        (select is_historical from public.expenses where id = '${expense?.expense_id}') as expense_historical;
    `);
    expect(flags?.sale_historical).toBe(true);
    expect(flags?.expense_historical).toBe(true);
  });

  it("suppresses low-stock alerts and outbox messages during product imports", async () => {
    const [before] = await sql<{ notifications: number; outbox: number }>(`
      select
        (select count(*) from public.notifications where business_id = '${businessId}') as notifications,
        (select count(*) from public.notification_outbox where business_id = '${businessId}') as outbox;
    `);
    const [product] = await asUser<{ id: string; stock: number }>(
      ownerId,
      `select * from public.import_product_row(
        '${businessId}', 'Imported low-stock test', '${newId()}', '', 'unit',
        1, 3, 1, 5, 0, '', null, null
      );`,
    );
    expect(product?.id).toBeTruthy();
    expect(product?.stock).toBe(1);

    const [after] = await sql<{ notifications: number; outbox: number }>(`
      select
        (select count(*) from public.notifications where business_id = '${businessId}') as notifications,
        (select count(*) from public.notification_outbox where business_id = '${businessId}') as outbox;
    `);
    expect(after?.notifications).toBe(before?.notifications);
    expect(after?.outbox).toBe(before?.outbox);
  });

  it("blocks users without the import permission", async () => {
    const cashierId = await createTestUser(`historical-cashier-${newId()}@example.com`);
    try {
      await sql(`
        insert into public.business_members (business_id, user_id, role)
        values ('${businessId}', '${cashierId}', 'cashier');
      `);
      await expect(
        asUser(
          cashierId,
          `select * from public.import_historical_sale_total(
            '${businessId}', '2026-09-10T00:00:00Z', 20, 8, null,
            '${"d".repeat(64)}', 2
          );`,
        ),
      ).rejects.toThrow(/permission/i);
    } finally {
      await deleteTestUser(cashierId);
    }
  });
});
