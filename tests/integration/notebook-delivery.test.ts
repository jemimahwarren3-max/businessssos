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

describeStaging("notebook and delivery: suppliers, deposits, lay-by", () => {
  let owner: string;
  let other: string;
  let biz: string;
  let otherBiz: string;
  let product: string;
  let customer: string;
  let supplier: string;

  beforeAll(async () => {
    owner = await createTestUser(`note-${newId()}@example.com`);
    other = await createTestUser(`note-other-${newId()}@example.com`);
    biz = await createTestBusiness(owner, `Notebook ${newId()}`);
    otherBiz = await createTestBusiness(other, `Other Notebook ${newId()}`);
    await sql(`
      delete from public.cash_movements where business_id = '${biz}';
      delete from public.cash_sessions where business_id = '${biz}';
    `);
    const [productRow] = await asUser<{ id: string }>(
      owner,
      `select id from public.create_product('${biz}', 'Layby oil', '', '', 'unit', 1, 10, 40, 0, 0, '', null, null);`,
    );
    product = productRow!.id;
    const [customerRow] = await sql<{ id: string }>(`
      insert into public.customers (business_id, name, phone)
      values ('${biz}', 'Layby Customer', '0773333333')
      returning id;
    `);
    customer = customerRow!.id;
    const [supplierRow] = await sql<{ id: string }>(`
      insert into public.suppliers (business_id, name)
      values ('${biz}', 'Harare Wholesaler')
      returning id;
    `);
    supplier = supplierRow!.id;
    await asUser(owner, `select public.open_cash_session('${biz}', 50, 'notebook float');`);
  }, 30_000);

  afterAll(async () => {
    if (biz) await deleteTestBusiness(biz);
    if (otherBiz) await deleteTestBusiness(otherBiz);
    if (owner) await deleteTestUser(owner);
    if (other) await deleteTestUser(other);
  }, 30_000);

  it("adds supplier outstanding when a PO is received and excludes the pay-out from takings", async () => {
    const [po] = await asUser<{ create_purchase_order: string }>(
      owner,
      `select public.create_purchase_order('${biz}', '${supplier}', current_date, '',
        '[{"productId":"${product}","name":"oil","quantity":2,"unitPrice":5,"taxRate":0}]'::jsonb);`,
    );
    await asUser(
      owner,
      `select public.set_purchase_order_status('${biz}', '${po!.create_purchase_order}', 'received');`,
    );
    const [owed] = await sql<{ outstanding_amount: string }>(`
      select outstanding_amount::text from public.suppliers where id = '${supplier}';
    `);
    expect(owed?.outstanding_amount).toBe("10.00");

    await asUser(
      owner,
      `select public.record_supplier_payment('${biz}', '${supplier}', 10, 'cash', 'cash', null, '${newId()}');`,
    );
    const [after] = await sql<{ outstanding_amount: string }>(`
      select outstanding_amount::text from public.suppliers where id = '${supplier}';
    `);
    expect(after?.outstanding_amount).toBe("0.00");

    const [takings] = await asUser<{
      get_daily_takings: { received: { rail: string; amount: number }[] };
    }>(owner, `select public.get_daily_takings('${biz}', current_date);`);
    const cashIn = (takings?.get_daily_takings.received ?? []).find((row) => row.rail === "cash");
    expect(cashIn?.amount ?? 0).toBe(0);

    await expect(
      asUser(
        other,
        `select public.record_supplier_payment('${otherBiz}', '${supplier}', 1, 'cash', 'cash', null, '${newId()}');`,
      ),
    ).rejects.toThrow(/could not be found|not owed|permission/i);
  });

  it("holds a deposit and refunds cash through the till", async () => {
    const [deposit] = await asUser<{ take_customer_deposit: string }>(
      owner,
      `select public.take_customer_deposit('${biz}', '${customer}', 4, 'cash', 'cash', null, '${newId()}');`,
    );
    expect(deposit?.take_customer_deposit).toBeTruthy();
    const [held] = await sql<{ status: string }>(`
      select status from public.customer_deposits where id = '${deposit!.take_customer_deposit}';
    `);
    expect(held?.status).toBe("held");

    await asUser(
      owner,
      `select public.refund_customer_deposit('${biz}', '${deposit!.take_customer_deposit}');`,
    );
    const [refunded] = await sql<{ status: string }>(`
      select status from public.customer_deposits where id = '${deposit!.take_customer_deposit}';
    `);
    expect(refunded?.status).toBe("refunded");
  });

  it("opens a lay-by without taking stock, then collects without posting cash again", async () => {
    const [before] = await sql<{ stock: string }>(`
      select stock::text from public.products where id = '${product}';
    `);
    const [layby] = await asUser<{ create_layby: string }>(
      owner,
      `select public.create_layby('${biz}', '${customer}',
        '[{"productId":"${product}","quantity":1}]'::jsonb, 10, null);`,
    );
    const [still] = await sql<{ stock: string }>(`
      select stock::text from public.products where id = '${product}';
    `);
    expect(still?.stock).toBe(before?.stock);

    const [cashBefore] = await sql<{ n: string }>(`
      select coalesce(sum(amount),0)::text as n
      from public.cash_movements
      where business_id = '${biz}';
    `);
    await asUser(
      owner,
      `select public.record_layby_instalment('${biz}', '${layby!.create_layby}', 10, 'cash', 'cash', null, '${newId()}');`,
    );
    const [afterPay] = await sql<{ n: string }>(`
      select coalesce(sum(amount),0)::text as n
      from public.cash_movements
      where business_id = '${biz}';
    `);
    expect(Number(afterPay?.n) - Number(cashBefore?.n)).toBe(10);

    await asUser(owner, `select public.collect_layby('${biz}', '${layby!.create_layby}', null);`);
    const [afterCollect] = await sql<{ n: string; stock: string }>(`
      select
        (select coalesce(sum(amount),0)::text from public.cash_movements where business_id = '${biz}') as n,
        (select stock::text from public.products where id = '${product}') as stock;
    `);
    expect(afterCollect?.n).toBe(afterPay?.n);
    expect(Number(afterCollect?.stock)).toBe(Number(before?.stock) - 1);

    const [status] = await sql<{ status: string; sale_id: string | null }>(`
      select status, sale_id::text from public.laybys where id = '${layby!.create_layby}';
    `);
    expect(status?.status).toBe("collected");
    expect(status?.sale_id).toBeTruthy();
  });
});
