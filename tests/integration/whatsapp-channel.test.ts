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
} from "./helpers";

describeStaging("WhatsApp outbox channel", () => {
  let owner: string;
  let biz: string;
  let product: string;
  let slug: string;

  beforeAll(async () => {
    const migration = fileURLToPath(
      new URL("../../supabase/migrations/20261102210000_whatsapp_channel.sql", import.meta.url),
    );
    await sql(readFileSync(migration, "utf8"));
    owner = await createTestUser(`wa-own-${newId()}@example.com`);
    biz = await createTestBusiness(owner, `WA Shop ${newId()}`);
    slug = `wa-${newId().slice(0, 8)}`;
    const [row] = await asUser<{ id: string }>(
      owner,
      `select id from public.create_product('${biz}', 'WA Product', '', '', 'unit', 1, 10, 20, 0, 0, '', null, null);`,
    );
    product = row!.id;
    await sql(`
      insert into public.storefronts (business_id, slug, store_name, template_id, status, published_at, delivery, payments)
      values (
        '${biz}', '${slug}', 'WA Shop', 'modern-minimal', 'published', now(),
        '{"pickupEnabled": true}'::jsonb,
        '{"payOnPickup": true}'::jsonb
      );
      insert into public.product_listings (product_id, business_id, published, slug)
      values ('${product}', '${biz}', true, 'wa-product');
    `);
  }, 60_000);

  afterAll(async () => {
    if (biz) await deleteTestBusiness(biz);
    if (owner) await deleteTestUser(owner);
  }, 30_000);

  it("queues WhatsApp after opt-in and refuses a fake sent status", async () => {
    const key = `wa-${newId()}`;
    const [placed] = await sql<{ create_store_order: Record<string, unknown> }>(`
      select public.create_store_order(
        '${slug}',
        '${key}',
        '{"name":"WA Buyer","phone":"0770000088","email":"buyer@example.com"}'::jsonb,
        '[{"productId":"${product}","quantity":1}]'::jsonb,
        'pickup',
        'pay_on_pickup',
        null
      );
    `);
    const reference = String(placed!.create_store_order["reference"]);
    const token = String(placed!.create_store_order["accessToken"]);
    const orderId = String(placed!.create_store_order["orderId"]);

    await sql(`
      select public.record_order_messaging_opt_in(
        '${orderId}'::uuid,
        '${token}',
        true,
        false
      );
    `);

    const [row] = await sql<{
      channel: string;
      to_phone: string;
      status: string;
      email_template: string;
    }>(`
      select channel, to_phone, status, email_template
      from public.notification_outbox
      where business_id = '${biz}' and idempotency_key = '${orderId}:whatsapp:placed';
    `);
    expect(row!.channel).toBe("whatsapp");
    expect(row!.to_phone).toMatch(/0770000088/);
    expect(row!.status).toBe("pending");
    expect(row!.email_template).toBe("customer.order.placed");

    const [email] = await sql<{ channel: string }>(`
      select channel from public.notification_outbox
      where business_id = '${biz}' and idempotency_key = '${orderId}:shopper:placed';
    `);
    expect(email!.channel).toBe("email");

    const [blocked] = await sql<{ complete_notification_outbox: unknown }>(`
      select public.complete_notification_outbox(
        (select id from public.notification_outbox
          where business_id = '${biz}' and idempotency_key = '${orderId}:whatsapp:placed'),
        'sent',
        '',
        ''
      );
    `).catch((error: Error) => [{ error: error.message }]);
    expect(JSON.stringify(blocked)).toMatch(
      /provider message id|WhatsApp cannot be marked sent|mail worker/i,
    );

    const [event] = await sql<{ id: string }>(`
      insert into public.store_order_events (business_id, order_id, event_type, message)
      values ('${biz}', '${orderId}', 'ready', 'Ready for pickup.')
      returning id;
    `);
    const [statusWa] = await sql<{ body: string; status: string }>(`
      select body, status
      from public.notification_outbox
      where business_id = '${biz}' and idempotency_key = '${orderId}:whatsapp:event:${event!.id}';
    `);
    expect(statusWa!.status).toBe("pending");
    expect(statusWa!.body).toContain("Ready for pickup");
    expect(statusWa!.body).not.toContain(token);
    expect(reference).toMatch(/^ON-/);
  });

  it("does not queue WhatsApp without opt-in", async () => {
    const key = `wa-no-${newId()}`;
    const [placed] = await sql<{ create_store_order: Record<string, unknown> }>(`
      select public.create_store_order(
        '${slug}',
        '${key}',
        '{"name":"Silent Buyer","phone":"0770000077","email":"silent@example.com"}'::jsonb,
        '[{"productId":"${product}","quantity":1}]'::jsonb,
        'pickup',
        'pay_on_pickup',
        null
      );
    `);
    const orderId = String(placed!.create_store_order["orderId"]);
    const rows = await sql<{ id: string }>(`
      select id from public.notification_outbox
      where business_id = '${biz}' and channel = 'whatsapp'
        and idempotency_key like '${orderId}:whatsapp:%';
    `);
    expect(rows).toEqual([]);
  });
});
