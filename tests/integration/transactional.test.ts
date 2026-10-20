import { expect, it } from "vitest";
import { asUser, createTestUser, deleteTestUser, describeStaging, newId, sql } from "./helpers";

async function cleanupBusiness(name: string) {
  await sql(`
    delete from public.subscriptions where business_id in (select id from public.businesses where name = '${name}');
    delete from public.business_settings where business_id in (select id from public.businesses where name = '${name}');
    delete from public.business_members where business_id in (select id from public.businesses where name = '${name}');
    delete from public.businesses where name = '${name}';
  `);
}

describeStaging("transactional business creation", () => {
  it("a normal call creates exactly one business + membership + settings + subscription row", async () => {
    const ownerId = await createTestUser(`atomic-${newId()}@example.com`);
    const name = `Atomic Test ${newId()}`;
    try {
      await asUser(
        ownerId,
        `select public.create_business_with_owner('${name}', 'other', 'USD', '', '');`,
      );
      const [row] = await sql<{
        business_count: number;
        member_count: number;
        settings_count: number;
        sub_count: number;
      }>(`
        select
          (select count(*) from public.businesses where name = '${name}')::int as business_count,
          (select count(*) from public.business_members bm join public.businesses b on b.id = bm.business_id where b.name = '${name}')::int as member_count,
          (select count(*) from public.business_settings bs join public.businesses b on b.id = bs.business_id where b.name = '${name}')::int as settings_count,
          (select count(*) from public.subscriptions s join public.businesses b on b.id = s.business_id where b.name = '${name}')::int as sub_count;
      `);
      expect(row).toMatchObject({
        business_count: 1,
        member_count: 1,
        settings_count: 1,
        sub_count: 1,
      });
    } finally {
      await cleanupBusiness(name);
      await deleteTestUser(ownerId);
    }
  }, 30_000);

  it("rejects an unauthenticated call outright — no business is created", async () => {
    const name = `Atomic Unauth Test ${newId()}`;
    try {
      await expect(
        sql(`select public.create_business_with_owner('${name}', 'other', 'USD', '', '');`),
      ).rejects.toThrow(/must be signed in/i);
      const countRows = await sql<{ count: number }>(
        `select count(*)::int as count from public.businesses where name = '${name}';`,
      );
      expect(countRows[0]?.count).toBe(0);
    } finally {
      await cleanupBusiness(name);
    }
  }, 30_000);
});
