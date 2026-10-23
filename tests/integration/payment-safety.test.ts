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

describeStaging("store payment safety", () => {
  let owner: string;
  let businessId: string;
  let productId: string;
  let slug: string;

  beforeAll(async () => {
    owner = await createTestUser(`payment-safety-${newId()}@example.com`);
    businessId = await createTestBusiness(owner, `Payment Safety ${newId()}`);
    productId = (
      await asUser<{ id: string }>(
        owner,
        `select id from public.create_product('${businessId}', 'Payment Safety Product', '', '', 'unit', 1, 5, 10, 0, 0, '', null, null);`,
      )
    )[0]!.id;
    slug = `pay-safe-${newId().slice(0, 8)}`;
    await sql(`
      insert into public.storefronts (
        business_id, slug, store_name, template_id, status, published_at, delivery, payments
      ) values (
        '${businessId}', '${slug}', 'Payment Safety Shop', 'modern-minimal', 'published', now(),
        '{"pickupEnabled": true}'::jsonb,
        '{"payOnPickup": true, "acceptPaynow": true,
          "manualMethods": [{"id":"ecocash-test","kind":"ecocash","enabled":true,
            "accountName":"Test Seller","accountDetail":"0770000000","instructions":"Pay to test seller"}]}'::jsonb
      );
      insert into public.product_listings (product_id, business_id, published, slug)
      values ('${productId}', '${businessId}', true, 'payment-safety-product');
      insert into public.store_paynow_credentials (business_id, ciphertext)
      values ('${businessId}', 'test-ciphertext');
    `);
  }, 60_000);

  afterAll(async () => {
    if (businessId) await deleteTestBusiness(businessId);
    if (owner) await deleteTestUser(owner);
  }, 30_000);

  it("leaves shop Paynow disabled and rejects direct Paynow checkout", async () => {
    const [control] = await sql<{ enabled: boolean; live_approved: boolean }>(`
      select enabled, live_approved
      from public.store_payment_provider_controls
      where provider = 'paynow';
    `);
    expect(control).toEqual({ enabled: false, live_approved: false });

    const [available] = await sql<{ shop_offers_paynow: boolean }>(
      `select public.shop_offers_paynow('${slug}');`,
    );
    expect(available!.shop_offers_paynow).toBe(false);

    await expect(
      sql(`
        select public.create_store_order(
          '${slug}', 'disabled-paynow-${newId()}',
          '{"name":"Test Buyer","phone":"0770000001","email":"buyer@example.com"}'::jsonb,
          '[{"productId":"${productId}","quantity":1}]'::jsonb,
          'pickup', 'paynow', null
        );
      `),
    ).rejects.toThrow(/has not connected Paynow/i);
  });

  it("keeps provider controls and the confirmation ledger inaccessible to authenticated clients", async () => {
    await expect(
      asUser(owner, `select * from public.store_payment_provider_controls;`),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asUser(owner, `select * from public.store_order_payment_confirmations;`),
    ).rejects.toThrow(/permission denied/i);
  });

  it("records a manual payment confirmation with the actor and order amount", async () => {
    const idempotencyKey = `manual-${newId()}`;
    const [created] = await sql<{ create_store_order: Record<string, unknown> }>(`
      select public.create_store_order(
        '${slug}', '${idempotencyKey}',
        '{"name":"Manual Buyer","phone":"0770000002","email":"buyer@example.com",
          "manualMethodId":"ecocash-test"}'::jsonb,
        '[{"productId":"${productId}","quantity":1}]'::jsonb,
        'pickup', 'manual', null
      );
    `);
    const orderId = String(created!.create_store_order["orderId"]);
    const [confirmed] = await asUser<{ record_store_order_payment: Record<string, unknown> }>(
      owner,
      `select public.record_store_order_payment('${businessId}', '${orderId}', 'TXN-123');`,
    );
    expect(confirmed!.record_store_order_payment).toBeTruthy();

    const [record] = await sql<{
      business_id: string;
      payment_method: string;
      confirmation_reference: string;
      amount: number;
      currency: string;
      confirmed_by: string;
    }>(`
      select business_id, payment_method, confirmation_reference, amount, currency, confirmed_by
      from public.store_order_payment_confirmations
      where order_id = '${orderId}';
    `);
    expect(record).toMatchObject({
      business_id: businessId,
      payment_method: "manual",
      confirmation_reference: "TXN-123",
      amount: 10,
      currency: "USD",
      confirmed_by: owner,
    });
    const [audit] = await sql<{ action: string; user_id: string }>(`
      select action, user_id
      from public.audit_logs
      where entity_type = 'store_order' and entity_id = '${orderId}'
        and action = 'store_order.seller_payment_confirmed';
    `);
    expect(audit).toEqual({
      action: "store_order.seller_payment_confirmed",
      user_id: owner,
    });
  });
});
