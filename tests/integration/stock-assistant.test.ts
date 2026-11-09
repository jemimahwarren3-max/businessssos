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

describeStaging("stock_assistant role", () => {
  let ownerId: string;
  let assistantId: string;
  let businessId: string;
  let productId: string;

  beforeAll(async () => {
    ownerId = await createTestUser(`stock-owner-${newId()}@example.com`);
    assistantId = await createTestUser(`stock-assistant-${newId()}@example.com`);
    businessId = await createTestBusiness(ownerId, `Stock assistant ${newId()}`);
    await sql(`
      insert into public.business_members (business_id, user_id, role)
      values ('${businessId}', '${assistantId}', 'stock_assistant');
    `);
  }, 60_000);

  afterAll(async () => {
    if (businessId) await deleteTestBusiness(businessId);
    if (ownerId) await deleteTestUser(ownerId);
    if (assistantId) await deleteTestUser(assistantId);
  }, 30_000);

  it("seeds inventory.view and inventory.adjust for stock assistants", async () => {
    const [perms] = await asUser<{ keys: string[] }>(
      assistantId,
      `select public.get_my_permissions('${businessId}') as keys;`,
    );
    expect(perms?.keys).toContain("inventory.view");
    expect(perms?.keys).toContain("inventory.adjust");
    expect(perms?.keys).not.toContain("sales.create");
    expect(perms?.keys).not.toContain("reports.financial");
  });

  it("lets stock assistants adjust stock but not record sales", async () => {
    const [product] = await asUser<{ id: string }>(
      ownerId,
      `select id from public.create_product(
        '${businessId}', 'Shelf widget', '', '', 'unit',
        1, 5, 10, 0, 0, ''
      ) limit 1;`,
    );
    productId = product!.id;

    await expect(
      asUser(
        assistantId,
        `select public.adjust_stock('${businessId}', '${productId}', 'stock_in', 2, 'restock');`,
      ),
    ).resolves.toBeDefined();

    await expect(
      asUser(
        assistantId,
        `select public.create_sale(
          '${businessId}', null, 0, 'cash', null,
          jsonb_build_array(jsonb_build_object('product_id', '${productId}', 'quantity', 1))
        );`,
      ),
    ).rejects.toThrow(/permission/i);
  });

  it("blocks stock assistants from reading sales and expenses via RLS", async () => {
    const sales = await asUser<{ n: number }>(
      assistantId,
      `select count(*)::int as n from public.sales;`,
    );
    expect(sales[0]?.["n"]).toBe(0);

    const expenses = await asUser<{ n: number }>(
      assistantId,
      `select count(*)::int as n from public.expenses;`,
    );
    expect(expenses[0]?.["n"]).toBe(0);

    const products = await asUser<{ n: number }>(
      assistantId,
      `select count(*)::int as n from public.products;`,
    );
    expect(products[0]?.["n"] ?? 0).toBeGreaterThan(0);
  });
});
