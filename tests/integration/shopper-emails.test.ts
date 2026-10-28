import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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

describeStaging("shopper order emails", () => {
  let owner: string;
  let biz: string;
  let product: string;
  let slug: string;

  beforeAll(async () => {
    const migration = fileURLToPath(
      new URL("../../supabase/migrations/20261019220000_shopper_order_emails.sql", import.meta.url),
    );
    await sql(readFileSync(migration, "utf8"));
    owner = await createTestUser(`mail-own-${newId()}@example.com`);
    biz = await createTestBusiness(owner, `Mail Shop ${newId()}`);
    slug = `em-${newId().slice(0, 8)}`;
    const [row] = await asUser<{ id: string }>(
      owner,
      `select id from public.create_product('${biz}', 'Mail Product', '', '', 'unit', 1, 10, 20, 0, 0, '', null, null);`,
    );
    product = row!.id;
    await sql(`
      insert into public.storefronts (business_id, slug, store_name, template_id, status, published_at, delivery, payments)
      values (
        '${biz}', '${slug}', 'Mail Shop', 'modern-minimal', 'published', now(),
        '{"pickupEnabled": true}'::jsonb,
        '{"payOnPickup": true}'::jsonb
      );
      insert into public.product_listings (product_id, business_id, published, slug)
      values ('${product}', '${biz}', true, 'mail-product');
    `);
  }, 60_000);

  afterAll(async () => {
    if (biz) await deleteTestBusiness(biz);
    if (owner) await deleteTestUser(owner);
  }, 30_000);

  it("queues a receipt with the access code and a status update without it", async () => {
    const key = `mail-${newId()}`;
    const [placed] = await sql<{ create_store_order: Record<string, unknown> }>(`
      select public.create_store_order(
        '${slug}',
        '${key}',
        '{"name":"Mail Buyer","phone":"0770000099","email":"buyer@example.com"}'::jsonb,
        '[{"productId":"${product}","quantity":1}]'::jsonb,
        'pickup',
        'pay_on_pickup',
        null
      );
    `);
    const reference = String(placed!.create_store_order["reference"]);
    const token = String(placed!.create_store_order["accessToken"]);
    const [order] = await sql<{ id: string }>(`
      select id from public.store_orders where business_id = '${biz}' and reference = '${reference}';
    `);

    const [receipt] = await sql<{
      to_email: string;
      body: string;
      status: string;
      notification_id: string | null;
    }>(`
      select to_email, body, status, notification_id
      from public.notification_outbox
      where business_id = '${biz}' and idempotency_key = '${order!.id}:shopper:placed';
    `);
    expect(receipt!.to_email).toBe("buyer@example.com");
    expect(receipt!.notification_id).toBeNull();
    expect(receipt!.status).toBe("pending");
    expect(receipt!.body).toContain(token);
    expect(receipt!.body).toMatch(/transactional/i);

    const [event] = await sql<{ id: string }>(`
      insert into public.store_order_events (business_id, order_id, event_type, message)
      values ('${biz}', '${order!.id}', 'ready', 'Ready for pickup.')
      returning id;
    `);
    const [statusMail] = await sql<{ body: string; subject: string }>(`
      select body, subject
      from public.notification_outbox
      where business_id = '${biz}' and idempotency_key = '${order!.id}:shopper:event:${event!.id}';
    `);
    expect(statusMail!.subject).toMatch(/Update on order/);
    expect(statusMail!.body).toContain("Ready for pickup.");
    expect(statusMail!.body).not.toContain(token);
  });
});
