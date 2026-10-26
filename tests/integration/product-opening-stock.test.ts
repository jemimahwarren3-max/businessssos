import { expect, it } from "vitest";
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

describeStaging("product opening stock", () => {
  it("records opening stock and its movement together through product creation", async () => {
    const userId = await createTestUser(`opening-stock-${newId()}@example.com`);
    const businessId = await createTestBusiness(userId, `Opening Stock ${newId()}`);
    const productName = `Imported Product ${newId()}`;

    try {
      const [created] = await asUser<{ id: string; stock: number }>(
        userId,
        `select id, stock from public.create_product(
          '${businessId}', '${productName}', '', '', 'unit', 1, 2, 5, 0, 0, '', null, null
        );`,
      );
      if (!created) throw new Error("The test product was not created.");
      expect(created).toMatchObject({ stock: 5 });

      const [result] = await sql<{
        product_stock: number;
        movement_count: number;
        movement_quantity: number;
      }>(`
        select
          p.stock::float8 as product_stock,
          count(m.id)::int as movement_count,
          coalesce(sum(m.quantity), 0)::float8 as movement_quantity
        from public.products p
        left join public.inventory_movements m on m.product_id = p.id
        where p.id = '${created.id}'
        group by p.id;
      `);

      expect(result).toMatchObject({
        product_stock: 5,
        movement_count: 1,
        movement_quantity: 5,
      });
    } finally {
      await deleteTestBusiness(businessId);
      await deleteTestUser(userId);
    }
  }, 30_000);
});
