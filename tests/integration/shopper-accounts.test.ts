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
  describeStaging,
} from "./helpers";

describeStaging("shopper accounts", () => {
  let owner: string;
  let shopper: string;
  let other: string;
  let biz: string;
  let product: string;
  let slug: string;

  beforeAll(async () => {
    owner = await createTestUser(`shop-own-${newId()}@example.com`);
    shopper = await createTestUser(`shopper-${newId()}@example.com`);
    other = await createTestUser(`shop-oth-${newId()}@example.com`);
    biz = await createTestBusiness(owner, `Shopper Acc ${newId()}`);
    slug = `sa-${newId().slice(0, 8)}`;
    const [row] = await asUser<{ id: string }>(
      owner,
      `select id from public.create_product('${biz}', 'Shopper Product', '', '', 'unit', 1, 10, 20, 0, 0, '', null, null);`,
    );
    product = row!.id;
    await sql(`
      insert into public.storefronts (business_id, slug, store_name, template_id, status, published_at, delivery, payments)
      values (
        '${biz}', '${slug}', 'Shopper Shop', 'modern-minimal', 'published', now(),
        '{"pickupEnabled": true}'::jsonb,
        '{"payOnPickup": true}'::jsonb
      );
      insert into public.product_listings (product_id, business_id, published, slug)
      values ('${product}', '${biz}', true, 'shopper-product');
    `);
  }, 60_000);

  afterAll(async () => {
    if (biz) await deleteTestBusiness(biz);
    if (owner) await deleteTestUser(owner);
    if (shopper) await deleteTestUser(shopper);
    if (other) await deleteTestUser(other);
  }, 30_000);

  it("keeps guest orders unattached, attaches signed-in orders, and still accepts the access code", async () => {
    const guestKey = `guest-${newId()}`;
    const [guestResult] = await sql<{ create_store_order: Record<string, unknown> }>(`
      select public.create_store_order(
        '${slug}',
        '${guestKey}',
        '{"name":"Guest Buyer","phone":"0770000001","email":"guest-match@example.com"}'::jsonb,
        '[{"productId":"${product}","quantity":1}]'::jsonb,
        'pickup',
        'pay_on_pickup',
        null
      );
    `);
    const guestRef = String(guestResult!.create_store_order["reference"]);
    const guestToken = String(guestResult!.create_store_order["accessToken"]);
    const [guestRow] = await sql<{ shopper_user_id: string | null }>(`
      select shopper_user_id from public.store_orders where business_id = '${biz}' and reference = '${guestRef}';
    `);
    expect(guestRow!.shopper_user_id).toBeNull();

    const [tokenLookup] = await sql<{ get_store_order: { reference: string } }>(`
      select public.get_store_order('${slug}', '${guestRef}', '${guestToken}');
    `);
    expect(tokenLookup!.get_store_order.reference).toBe(guestRef);

    const signedKey = `signed-${newId()}`;
    const [signed] = await asUser<{ create_store_order: Record<string, unknown> }>(
      shopper,
      `select public.create_store_order(
        '${slug}',
        '${signedKey}',
        '{"name":"Signed Buyer","phone":"0770000002","email":"signed@example.com","messagesConsent": true}'::jsonb,
        '[{"productId":"${product}","quantity":1}]'::jsonb,
        'pickup',
        'pay_on_pickup',
        null
      );`,
    );
    const signedRef = String(signed!.create_store_order["reference"]);
    const [attached] = await sql<{ shopper_user_id: string }>(`
      select shopper_user_id from public.store_orders where business_id = '${biz}' and reference = '${signedRef}';
    `);
    expect(attached!.shopper_user_id).toBe(shopper);

    const [history] = await asUser<{
      get_shopper_account: { orders: { reference: string }[]; messagesConsent: boolean };
    }>(shopper, `select public.get_shopper_account('${slug}');`);
    expect(history!.get_shopper_account.messagesConsent).toBe(true);
    expect(history!.get_shopper_account.orders.some((row) => row.reference === signedRef)).toBe(
      true,
    );
    expect(history!.get_shopper_account.orders.some((row) => row.reference === guestRef)).toBe(
      false,
    );

    const [otherHistory] = await asUser<{ get_shopper_account: { orders: unknown[] } }>(
      other,
      `select public.get_shopper_account('${slug}');`,
    );
    expect(otherHistory!.get_shopper_account.orders).toEqual([]);

    await asUser(
      shopper,
      `select public.claim_store_order('${slug}', '${guestRef}', '${guestToken}');`,
    );
    const [claimed] = await sql<{ shopper_user_id: string }>(`
      select shopper_user_id from public.store_orders where business_id = '${biz}' and reference = '${guestRef}';
    `);
    expect(claimed!.shopper_user_id).toBe(shopper);

    const [stillGuestCode] = await sql<{ get_store_order: { reference: string } }>(`
      select public.get_store_order('${slug}', '${guestRef}', '${guestToken}');
    `);
    expect(stillGuestCode!.get_store_order.reference).toBe(guestRef);

    await expect(
      asUser(other, `select public.claim_store_order('${slug}', '${guestRef}', '${guestToken}');`),
    ).rejects.toThrow(/already saved to another account/i);

    await expect(
      asUser(other, `select public.get_store_order('${slug}', '${signedRef}', '');`),
    ).rejects.toThrow(/could not be found/i);
  }, 60_000);
});
