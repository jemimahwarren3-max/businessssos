import { afterAll, beforeAll, expect, it } from "vitest";
import {
  asUser,
  createTestBusiness,
  createTestUser,
  deleteTestBusiness,
  deleteTestUser,
  newId,
  sql,
  describeStaging,
} from "./helpers";

describeStaging("cash drawer ledger", () => {
  let owner: string;
  let biz: string;
  let product: string;

  beforeAll(async () => {
    owner = await createTestUser(`cash-${newId()}@example.com`);
    biz = await createTestBusiness(owner, `Cash Drawer ${newId()}`);
    await sql(`
      delete from public.cash_movements where business_id = '${biz}';
      delete from public.cash_sessions where business_id = '${biz}';
    `);
    const [row] = await asUser<{ id: string }>(
      owner,
      `select id from public.create_product('${biz}', 'Cash Product', '', '', 'unit', 1, 10, 20, 0, 0, '', null, null);`,
    );
    product = row!.id;
  }, 30_000);

  afterAll(async () => {
    if (biz) await deleteTestBusiness(biz);
    if (owner) await deleteTestUser(owner);
  }, 30_000);

  it("refuses a cash sale until a drawer is open, then posts the float and sale", async () => {
    await expect(
      asUser(
        owner,
        `select public.create_sale('${biz}', null, 0, 'cash', 'no drawer',
          '[{"productId":"${product}","quantity":1,"unitPrice":10}]'::jsonb,
          'cash-${newId()}', null);`,
      ),
    ).rejects.toThrow(/open the cash drawer/i);

    await asUser(owner, `select public.open_cash_session('${biz}', 40, 'morning');`);
    await asUser(
      owner,
      `select public.create_sale('${biz}', null, 0, 'cash', 'with drawer',
        '[{"productId":"${product}","quantity":1,"unitPrice":10}]'::jsonb,
        'cash-${newId()}', null);`,
    );

    const [sum] = await sql<{ expected: string }>(`
      select coalesce(sum(amount),0)::text as expected
      from public.cash_movements
      where session_id = (
        select id from public.cash_sessions where business_id = '${biz}' and closed_at is null
      );
    `);
    expect(Number(sum!.expected)).toBe(50);

    const [closed] = await asUser<{ close_cash_session: { discrepancy: number } }>(
      owner,
      `select public.close_cash_session('${biz}', 50, 'matched');`,
    );
    expect(Number(closed?.close_cash_session?.discrepancy ?? 0)).toBe(0);
  });
});
