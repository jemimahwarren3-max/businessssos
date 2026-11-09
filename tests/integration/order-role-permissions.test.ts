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

describeStaging("online order role permissions", () => {
  let ownerId: string;
  let managerId: string;
  let cashierId: string;
  let businessId: string;

  beforeAll(async () => {
    ownerId = await createTestUser(`orders-owner-${newId()}@example.com`);
    managerId = await createTestUser(`orders-manager-${newId()}@example.com`);
    cashierId = await createTestUser(`orders-cashier-${newId()}@example.com`);
    businessId = await createTestBusiness(ownerId, `Order permissions ${newId()}`);
    await sql(`
      insert into public.business_members (business_id, user_id, role)
      values
        ('${businessId}', '${managerId}', 'manager'),
        ('${businessId}', '${cashierId}', 'cashier');
    `);
  }, 60_000);

  afterAll(async () => {
    await deleteTestBusiness(businessId);
    await deleteTestUser(ownerId);
    await deleteTestUser(managerId);
    await deleteTestUser(cashierId);
  }, 30_000);

  it("allows managers to manage orders without exposing storefront settings", async () => {
    const permissions = await asUser<{ allowed: boolean }>(
      managerId,
      `select public.has_permission('${businessId}', 'orders.manage') as allowed;`,
    );
    expect(permissions[0]?.allowed).toBe(true);

    const orders = await asUser<{ orders: unknown }>(
      managerId,
      `select public.get_storefront_orders('${businessId}') as orders;`,
    );
    expect(Array.isArray(orders[0]?.orders)).toBe(true);

    await expect(
      asUser(managerId, `select public.get_storefront_admin('${businessId}');`),
    ).rejects.toThrow(/role does not allow|permission/i);
  });

  it("refuses cashier access to storefront orders and order details through SQL RPCs", async () => {
    const permissions = await asUser<{ allowed: boolean }>(
      cashierId,
      `select public.has_permission('${businessId}', 'orders.manage') as allowed;`,
    );
    expect(permissions[0]?.allowed).toBe(false);

    await expect(
      asUser(cashierId, `select public.get_storefront_orders('${businessId}');`),
    ).rejects.toThrow(/role does not allow|permission/i);
    await expect(
      asUser(cashierId, `select public.get_store_order_admin('${businessId}', '${newId()}');`),
    ).rejects.toThrow(/role does not allow|permission/i);
    await expect(
      asUser(
        cashierId,
        `select public.transition_store_order('${businessId}', '${newId()}', 'confirm');`,
      ),
    ).rejects.toThrow(/role does not allow|permission/i);
  });
});
