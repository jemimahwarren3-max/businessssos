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

describeStaging("morning desk: rails, takings, credit book", () => {
  let owner: string;
  let other: string;
  let biz: string;
  let otherBiz: string;
  let product: string;
  let customer: string;

  beforeAll(async () => {
    owner = await createTestUser(`desk-${newId()}@example.com`);
    other = await createTestUser(`desk-other-${newId()}@example.com`);
    biz = await createTestBusiness(owner, `Morning Desk ${newId()}`);
    otherBiz = await createTestBusiness(other, `Other Desk ${newId()}`);
    await sql(`
      delete from public.cash_movements where business_id = '${biz}';
      delete from public.cash_sessions where business_id = '${biz}';
    `);
    const [productRow] = await asUser<{ id: string }>(
      owner,
      `select id from public.create_product('${biz}', 'Cooking oil', '', '', 'unit', 1, 10, 50, 0, 0, '', null, null);`,
    );
    product = productRow!.id;
    const [customerRow] = await sql<{ id: string }>(`
      insert into public.customers (business_id, name, phone)
      values ('${biz}', 'Tendai Credit', '0771111111')
      returning id;
    `);
    customer = customerRow!.id;
  }, 30_000);

  afterAll(async () => {
    if (biz) await deleteTestBusiness(biz);
    if (otherBiz) await deleteTestBusiness(otherBiz);
    if (owner) await deleteTestUser(owner);
    if (other) await deleteTestUser(other);
  }, 30_000);

  it("records EcoCash without an open drawer and stores the rail", async () => {
    const key = newId();
    await asUser(
      owner,
      `select public.create_sale('${biz}', null, 0, 'mobile_money', 'ecocash sale',
        '[{"productId":"${product}","quantity":1,"unitPrice":10}]'::jsonb,
        '${key}', null, 'ecocash');`,
    );
    const [row] = await sql<{ rail: string; method: string }>(`
      select rail, method::text as method from public.payments
      where business_id = '${biz}'
      order by paid_at desc limit 1;
    `);
    expect(row?.rail).toBe("ecocash");
    expect(row?.method).toBe("mobile_money");
  });

  it("still refuses cash until the drawer is open", async () => {
    await expect(
      asUser(
        owner,
        `select public.create_sale('${biz}', null, 0, 'cash', 'no drawer',
          '[{"productId":"${product}","quantity":1,"unitPrice":10}]'::jsonb,
          '${newId()}', null, 'cash');`,
      ),
    ).rejects.toThrow(/open the cash drawer/i);
  });

  it("records a credit sale, then a repayment that cannot exceed the balance", async () => {
    await asUser(
      owner,
      `select public.create_sale('${biz}', '${customer}', 0, 'credit', 'on account',
        '[{"productId":"${product}","quantity":1,"unitPrice":10}]'::jsonb,
        '${newId()}', null, 'credit');`,
    );
    const [owed] = await sql<{ outstanding_balance: string }>(`
      select outstanding_balance::text from public.customers where id = '${customer}';
    `);
    expect(Number(owed!.outstanding_balance)).toBeGreaterThan(0);

    const repayKey = newId();
    await asUser(
      owner,
      `select public.record_customer_credit_payment('${biz}', '${customer}', 1, 'mobile_money',
        'ecocash', 'ref-1', '${repayKey}');`,
    );
    const [after] = await sql<{ outstanding_balance: string }>(`
      select outstanding_balance::text from public.customers where id = '${customer}';
    `);
    expect(Number(after!.outstanding_balance)).toBe(Number(owed!.outstanding_balance) - 1);

    const [again] = await asUser<{ record_customer_credit_payment: string }>(
      owner,
      `select public.record_customer_credit_payment('${biz}', '${customer}', 1, 'mobile_money',
        'ecocash', 'ref-1', '${repayKey}');`,
    );
    expect(again?.record_customer_credit_payment).toBeTruthy();

    await expect(
      asUser(
        owner,
        `select public.record_customer_credit_payment('${biz}', '${customer}', 99999, 'cash',
          'cash', '', '${newId()}');`,
      ),
    ).rejects.toThrow(/outstanding balance/i);
  });

  it("does not let another business repay this customer", async () => {
    await expect(
      asUser(
        other,
        `select public.record_customer_credit_payment('${biz}', '${customer}', 1, 'cash',
          'cash', '', '${newId()}');`,
      ),
    ).rejects.toThrow(/permission|access|could not be found/i);
  });

  it("groups today's takings by rail for a member and hides them from another shop", async () => {
    const [mine] = await asUser<{ get_daily_takings: { received: { rail: string }[] } }>(
      owner,
      `select public.get_daily_takings('${biz}', null);`,
    );
    const rails = (mine?.get_daily_takings?.received ?? []).map((row) => row.rail);
    expect(rails).toContain("ecocash");

    await expect(asUser(other, `select public.get_daily_takings('${biz}', null);`)).rejects.toThrow(
      /access|permission/i,
    );
  });
});
