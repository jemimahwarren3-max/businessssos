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

  it("auto-opens the drawer on a cash sale and posts the payment", async () => {
    await asUser(
      owner,
      `select public.create_sale('${biz}', null, 0, 'cash', 'auto session',
        '[{"productId":"${product}","quantity":1,"unitPrice":10}]'::jsonb,
        'cash-${newId()}', null);`,
    );

    const [session] = await sql<{ id: string; opening_float: string }>(`
      select id, opening_float::text
      from public.cash_sessions
      where business_id = '${biz}' and closed_at is null
      limit 1;
    `);
    expect(session?.id).toBeTruthy();
    expect(Number(session?.opening_float ?? -1)).toBe(0);

    const [sum] = await sql<{ expected: string }>(`
      select coalesce(sum(amount),0)::text as expected
      from public.cash_movements
      where session_id = '${session!.id}';
    `);
    expect(Number(sum!.expected)).toBe(10);

    const [closed] = await asUser<{ close_cash_session: { discrepancy: number } }>(
      owner,
      `select public.close_cash_session('${biz}', 10, 'matched');`,
    );
    expect(Number(closed?.close_cash_session?.discrepancy ?? 0)).toBe(0);
  });
});
