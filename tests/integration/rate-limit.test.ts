import { afterEach, expect, it } from "vitest";
import { describeStaging, newId, sql } from "./helpers";

describeStaging("rate limiting", () => {
  let usedKey: string | undefined;

  afterEach(async () => {
    if (usedKey) {
      await sql(`delete from public.rate_limit_hits where key = '${usedKey}';`);
      usedKey = undefined;
    }
  });

  it("allows up to the limit, then rejects the next call in the same window", async () => {
    const key = `test-rl-${newId()}`;
    usedKey = key;

    const results: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      const [row] = await sql<{ allowed: boolean }>(
        `select public.check_rate_limit('${key}', 3, 60) as allowed;`,
      );
      results.push(row!.allowed);
    }

    expect(results).toEqual([true, true, true, false]);
  }, 30_000);

  it("different keys don't share a bucket", async () => {
    const keyA = `test-rl-a-${newId()}`;
    const keyB = `test-rl-b-${newId()}`;
    await sql(`select public.check_rate_limit('${keyA}', 1, 60);`);
    const [row] = await sql<{ allowed: boolean }>(
      `select public.check_rate_limit('${keyB}', 1, 60) as allowed;`,
    );
    expect(row?.allowed).toBe(true);
    await sql(`delete from public.rate_limit_hits where key in ('${keyA}', '${keyB}');`);
  }, 30_000);

  // Regression test for a real vulnerability found via Supabase's own
  // Security Advisor (not this session's own review): staging had RLS
  // disabled on this table with full grants to anon/authenticated, so an
  // unauthenticated request could delete its own bucket directly via
  // PostgREST and bypass brute-force protection on sign-in entirely.
  it("an unauthenticated (anon) role cannot touch rate_limit_hits directly", async () => {
    const key = `test-rl-anon-attack-${newId()}`;
    usedKey = key;
    await sql(`select public.check_rate_limit('${key}', 3, 60);`);

    try {
      await expect(
        sql(`set local role anon; delete from public.rate_limit_hits where key = '${key}';`),
      ).rejects.toThrow(/permission denied/i);
    } finally {
      // Same defensive reset asUser()/asServiceRole() do — the Management
      // API's underlying connection can be reused across separate sql()
      // calls, so a role set by one must never leak into the next.
      await sql(`reset role;`).catch(() => {});
    }

    const [check] = await sql<{ count: number }>(
      `select count(*)::int as count from public.rate_limit_hits where key = '${key}';`,
    );
    expect(check?.count).toBe(1);
  }, 30_000);
});
