import { afterAll, beforeAll, expect, it } from "vitest";
import {
  asServiceRole,
  asUser,
  createTestBusiness,
  createTestUser,
  deleteTestBusiness,
  deleteTestUser,
  describeStaging,
  newId,
  sql,
} from "./helpers";

describeStaging("store growth intelligence", () => {
  let owner: string;
  let outsider: string;
  let businessId: string;
  let productId: string;
  let campaignId: string;
  let slug: string;
  const visitorId = newId();

  beforeAll(async () => {
    owner = await createTestUser(`growth-owner-${newId()}@example.com`);
    outsider = await createTestUser(`growth-outsider-${newId()}@example.com`);
    businessId = await createTestBusiness(owner, `Growth Intelligence ${newId()}`);
    const [product] = await asUser<{ id: string }>(
      owner,
      `select id from public.create_product('${businessId}', 'Growth Test Product', '', '', 'unit', 10, 5, 10, 0, 0, '', null, null);`,
    );
    productId = product!.id;
    slug = `growth-${newId().slice(0, 8)}`;

    await sql(`
      insert into public.storefronts (
        business_id, slug, store_name, template_id, status, published_at, delivery, payments
      ) values (
        '${businessId}', '${slug}', 'Growth Test Shop', 'modern-minimal', 'published', now(),
        '{"pickupEnabled": true}',
        '{"payOnPickup": true, "manualMethods": [{"id":"test-manual","kind":"ecocash",
          "enabled":true,"accountName":"Test Seller","accountDetail":"0770000000",
          "instructions":"Pay to test seller"}]}'
      );
      insert into public.product_listings (product_id, business_id, published, slug)
      values ('${productId}', '${businessId}', true, 'growth-test-product');
    `);

    const [campaign] = await asUser<{ id: string }>(
      owner,
      `insert into public.store_marketing_campaigns (
        business_id, name, channel, objective, product_id, headline, copy, call_to_action
      ) values (
        '${businessId}', 'Test WhatsApp campaign', 'whatsapp', 'Test campaign attribution',
        '${productId}', 'A test headline', 'Test campaign copy', 'View the shop'
      ) returning id;`,
    );
    campaignId = campaign!.id;
  }, 60_000);

  afterAll(async () => {
    if (businessId) await deleteTestBusiness(businessId);
    if (owner) await deleteTestUser(owner);
    if (outsider) await deleteTestUser(outsider);
  }, 30_000);

  it("restricts event writes to the trusted server role and analytics to permitted members", async () => {
    await expect(
      asUser(
        owner,
        `select public.record_storefront_analytics_event(
          '${slug}', '${newId()}', '${newId()}', 'page_view', null, null, 'direct'
        );`,
      ),
    ).rejects.toThrow(/permission denied/i);

    await expect(
      asUser(outsider, `select public.get_store_growth_metrics('${businessId}', 30);`),
    ).rejects.toThrow(/does not allow storefront analytics|permission denied/i);
  });

  it("counts consenting visitors and campaign sales without treating other paid orders as tracked conversions", async () => {
    await asServiceRole(`
      select public.record_storefront_analytics_event(
        '${slug}', '${newId()}', '${visitorId}', 'page_view', null, '${campaignId}', 'whatsapp'
      );
      select public.record_storefront_analytics_event(
        '${slug}', '${newId()}', '${visitorId}', 'product_view', 'growth-test-product', '${campaignId}', 'whatsapp'
      );
    `);

    const createOrder = async (key: string) => {
      const [created] = await sql<{ create_store_order: Record<string, unknown> }>(`
        select public.create_store_order(
          '${slug}', '${key}',
          '{"name":"Growth Test Buyer","phone":"0770000001","manualMethodId":"test-manual"}'::jsonb,
          '[{"productId":"${productId}","quantity":1}]'::jsonb,
          'pickup', 'manual', null
        );
      `);
      return String(created!.create_store_order["orderId"]);
    };

    const attributedOrder = await createOrder(`growth-attributed-${newId()}`);
    const unattributedOrder = await createOrder(`growth-unattributed-${newId()}`);
    await asServiceRole(
      `select public.attribute_store_order_analytics('${attributedOrder}', '${visitorId}', '${campaignId}');`,
    );
    await asUser(
      owner,
      `select public.record_store_order_payment('${businessId}', '${attributedOrder}', 'GROWTH-PAID-1');`,
    );
    await asUser(
      owner,
      `select public.record_store_order_payment('${businessId}', '${unattributedOrder}', 'GROWTH-PAID-2');`,
    );

    const [result] = await asUser<{ get_store_growth_metrics: Record<string, unknown> }>(
      owner,
      `select public.get_store_growth_metrics('${businessId}', 30);`,
    );
    const metrics = result!.get_store_growth_metrics as {
      uniqueVisitors: number;
      productViews: number;
      orders: number;
      paidOrders: number;
      trackedPaidOrders: number;
      trackedPaidVisitors: number;
      conversionRate: number;
      paidRevenueByCurrency: { currency: string; amount: number }[];
      campaigns: {
        id: string;
        visitors: number;
        orders: number;
        paidOrders: number;
        paidRevenueByCurrency: { currency: string; amount: number }[];
      }[];
    };
    expect(metrics).toMatchObject({
      uniqueVisitors: 1,
      productViews: 1,
      orders: 2,
      paidOrders: 2,
      trackedPaidOrders: 1,
      trackedPaidVisitors: 1,
      conversionRate: 100,
      paidRevenueByCurrency: [{ currency: "USD", amount: 10 }],
      campaigns: [
        {
          id: campaignId,
          visitors: 1,
          orders: 1,
          paidOrders: 1,
          paidRevenueByCurrency: [{ currency: "USD", amount: 5 }],
        },
      ],
    });
  }, 60_000);
});
