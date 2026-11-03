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

describeStaging("split tenders and recorded currency", () => {
  let owner: string;
  let other: string;
  let biz: string;
  let otherBiz: string;
  let product: string;
  let customer: string;

  beforeAll(async () => {
    owner = await createTestUser(`split-${newId()}@example.com`);
    other = await createTestUser(`split-other-${newId()}@example.com`);
    biz = await createTestBusiness(owner, `Split Tenders ${newId()}`);
    otherBiz = await createTestBusiness(other, `Other Split ${newId()}`);
    await sql(`
      delete from public.cash_movements where business_id = '${biz}';
      delete from public.cash_sessions where business_id = '${biz}';
    `);
    const [productRow] = await asUser<{ id: string }>(
      owner,
      `select id from public.create_product('${biz}', 'Split oil', '', '', 'unit', 1, 10, 80, 0, 0, '', null, null);`,
    );
    product = productRow!.id;
    const [customerRow] = await sql<{ id: string }>(`
      insert into public.customers (business_id, name, phone)
      values ('${biz}', 'Split Customer', '0772222222')
      returning id;
    `);
    customer = customerRow!.id;
    await asUser(owner, `select public.open_cash_session('${biz}', 20, 'split float');`);
  }, 30_000);

  afterAll(async () => {
    if (biz) await deleteTestBusiness(biz);
    if (otherBiz) await deleteTestBusiness(otherBiz);
    if (owner) await deleteTestUser(owner);
    if (other) await deleteTestUser(other);
  }, 30_000);

  it("splits cash + EcoCash, posts only cash to the till, and stores an unconverted ZiG original", async () => {
    const key = newId();
    await asUser(
      owner,
      `select public.create_sale('${biz}', null, 0, 'cash', 'split sale',
        '[{"productId":"${product}","quantity":1,"unitPrice":10}]'::jsonb,
        '${key}', null, 'cash',
        '[{"rail":"cash","amount":4},{"rail":"ecocash","amount":6,"currency":"ZWG","amountOriginal":480}]'::jsonb);`,
    );

    const payments = await sql<{
      rail: string;
      method: string;
      amount: string;
      currency: string | null;
      amount_original: string | null;
    }>(`
      select rail, method::text as method, amount::text, currency, amount_original::text
      from public.payments
      where business_id = '${biz}'
      order by amount;
    `);
    expect(payments).toHaveLength(2);
    expect(payments[0]).toMatchObject({ rail: "cash", method: "cash", amount: "4.00" });
    expect(payments[1]).toMatchObject({
      rail: "ecocash",
      method: "mobile_money",
      amount: "6.00",
      currency: "ZWG",
      amount_original: "480.00",
    });

    const [till] = await sql<{ cash_sales: string }>(`
      select coalesce(sum(amount),0)::text as cash_sales
      from public.cash_movements
      where business_id = '${biz}' and kind = 'cash_sale';
    `);
    expect(Number(till!.cash_sales)).toBe(4);
  });

  it("rejects tenders that do not add up to the sale total", async () => {
    await expect(
      asUser(
        owner,
        `select public.create_sale('${biz}', null, 0, 'cash', 'bad split',
          '[{"productId":"${product}","quantity":1,"unitPrice":10}]'::jsonb,
          '${newId()}', null, 'cash',
          '[{"rail":"cash","amount":1},{"rail":"ecocash","amount":1}]'::jsonb);`,
      ),
    ).rejects.toThrow(/add up to the sale total/i);
  });

  it("records EcoCash + ZIPIT without an open extra drawer and without converting", async () => {
    await asUser(
      owner,
      `select public.create_sale('${biz}', null, 0, 'mobile_money', 'digital split',
        '[{"productId":"${product}","quantity":1,"unitPrice":10}]'::jsonb,
        '${newId()}', null, 'ecocash',
        '[{"rail":"ecocash","amount":7},{"rail":"zipit","amount":3}]'::jsonb);`,
    );
    const rails = await sql<{ rail: string }>(`
      select rail from public.payments
      where business_id = '${biz}' and rail in ('zipit')
      order by paid_at desc limit 1;
    `);
    expect(rails[0]?.rail).toBe("zipit");
  });

  it("puts only the credit remainder on the customer book", async () => {
    await asUser(
      owner,
      `select public.create_sale('${biz}', '${customer}', 0, 'cash', 'part credit',
        '[{"productId":"${product}","quantity":1,"unitPrice":10}]'::jsonb,
        '${newId()}', null, 'cash',
        '[{"rail":"cash","amount":3},{"rail":"credit","amount":7}]'::jsonb);`,
    );
    const [owed] = await sql<{ outstanding_balance: string }>(`
      select outstanding_balance::text from public.customers where id = '${customer}';
    `);
    expect(Number(owed!.outstanding_balance)).toBe(7);

    const [sale] = await sql<{ amount_paid: string; total: string }>(`
      select amount_paid::text, total::text from public.sales
      where business_id = '${biz}' and customer_id = '${customer}'
      order by created_at desc limit 1;
    `);
    expect(Number(sale!.amount_paid)).toBe(3);
    expect(Number(sale!.total)).toBe(10);
  });

  it("refunds cash-first on a split sale so the till is not given the EcoCash part", async () => {
    const key = newId();
    const [created] = await asUser<{ create_sale: string }>(
      owner,
      `select public.create_sale('${biz}', null, 0, 'cash', 'refund split',
        '[{"productId":"${product}","quantity":1,"unitPrice":10}]'::jsonb,
        '${key}', null, 'cash',
        '[{"rail":"cash","amount":6},{"rail":"ecocash","amount":4}]'::jsonb);`,
    );
    const saleId = created!.create_sale;
    const [item] = await sql<{ id: string }>(`
      select id from public.sale_items where sale_id = '${saleId}' limit 1;
    `);
    await asUser(
      owner,
      `select public.refund_sale('${biz}', '${saleId}',
        '[{"saleItemId":"${item!.id}","quantity":1}]'::jsonb, 'split refund');`,
    );
    const [refunded] = await sql<{ amount: string }>(`
      select amount::text from public.cash_movements
      where business_id = '${biz}' and kind = 'cash_refund'
      order by created_at desc limit 1;
    `);
    expect(Number(refunded!.amount)).toBe(-6);
  });

  it("does not let another business record a split sale here", async () => {
    await expect(
      asUser(
        other,
        `select public.create_sale('${biz}', null, 0, 'cash', 'other',
          '[{"productId":"${product}","quantity":1,"unitPrice":10}]'::jsonb,
          '${newId()}', null, 'cash',
          '[{"rail":"cash","amount":10}]'::jsonb);`,
      ),
    ).rejects.toThrow(/permission|access|could not be found/i);
  });
});
