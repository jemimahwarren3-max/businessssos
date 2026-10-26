import { afterAll, beforeAll, expect, it } from "vitest";
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

describeStaging("billing RPC operate enforcement", () => {
  let ownerId: string;
  let businessId: string;
  let productId: string;

  beforeAll(async () => {
    ownerId = await createTestUser(`rpc-billing-${newId()}@example.com`);
    businessId = await createTestBusiness(ownerId, `RPC Billing ${newId()}`);
    const [row] = await sql<{ id: string }>(
      `insert into public.products (business_id, name, selling_price, cost_price, stock, unit)
       values ('${businessId}', 'Test SKU', 1, 0.5, 10, 'unit')
       returning id;`,
    );
    productId = row!.id;
    await sql(`update public.platform_runtime set billing_enforced = true where id = 1;`);
  }, 30_000);

  afterAll(async () => {
    await sql(`update public.platform_runtime set billing_enforced = false where id = 1;`);
    await deleteTestBusiness(businessId);
    await deleteTestUser(ownerId);
  }, 30_000);

  it("blocks create_sale for trialing businesses when billing is enforced in Postgres", async () => {
    await expect(
      asUser(
        ownerId,
        `select public.create_sale(
          '${businessId}', null, 0, 'cash'::public.payment_method, 'test',
          jsonb_build_array(jsonb_build_object('productId', '${productId}', 'quantity', 1)),
          null, null
        );`,
      ),
    ).rejects.toThrow(/active subscription/i);
  });

  it("allows create_sale after subscription is active", async () => {
    await sql(
      `update public.subscriptions set status = 'active', current_period_end = now() + interval '30 days' where business_id = '${businessId}';`,
    );
    const [sale] = await asUser<{ create_sale: string }>(
      ownerId,
      `select public.create_sale(
        '${businessId}', null, 0, 'cash'::public.payment_method, 'test',
        jsonb_build_array(jsonb_build_object('productId', '${productId}', 'quantity', 1)),
        'idem-${newId()}', null
      ) as create_sale;`,
    );
    expect(sale?.create_sale).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});
