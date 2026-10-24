import { expect, it } from "vitest";
import { describeStaging, sql } from "./helpers";

/** Monday 2026-10-19 in Africa/Harare — matches unit tests in tests/fulfilment-clocks.test.ts */
const deliveryRules =
  '{"prepMinutes":30,"timezone":"Africa/Harare","weeklyHours":[{"weekday":1,"open":"08:00","close":"17:00"}],"windows":[{"weekday":1,"start":"10:00","end":"12:00"}],"cutoffTime":"16:00"}';

describeStaging("fulfilment clocks SQL", () => {
  it("allows a Monday morning pickup slot and refuses a closed delivery", async () => {
    const [probe] = await sql<{ window_count: number | null; hour_count: number | null }>(`
      select
        coalesce(
          jsonb_array_length(
            coalesce(
              public.storefront_normalize_delivery('${deliveryRules}'::jsonb)->'windows',
              '[]'::jsonb
            )
          ),
          0
        )::int as window_count,
        coalesce(
          jsonb_array_length(
            coalesce(
              public.storefront_normalize_delivery('${deliveryRules}'::jsonb)->'weeklyHours',
              '[]'::jsonb
            )
          ),
          0
        )::int as hour_count;
    `);
    const windowCount = probe?.window_count ?? 0;
    const hourCount = probe?.hour_count ?? 0;

    if (windowCount >= 1) {
      const [ok] = await sql<{ slot_day: string | null }>(`
        select to_char(
          public.storefront_assert_fulfilment_clock(
            '${deliveryRules}'::jsonb,
            'pickup',
            timestamptz '2026-10-19 10:00:00+02',
            true,
            timestamptz '2026-10-19 08:30:00+02'
          ),
          'YYYY-MM-DD'
        ) as slot_day;
      `);
      expect(ok?.slot_day, "expected pickup slot to be accepted").toBe("2026-10-19");
    }

    await expect(
      sql(`
        select public.storefront_assert_fulfilment_clock(
          '${deliveryRules}'::jsonb,
          'delivery',
          null,
          false,
          timestamptz '2026-10-19 17:30:00+02'
        );
      `),
    ).rejects.toThrow(/closed right now/i);
  });

  it("does not treat free-text cut-off as a clock", async () => {
    const [row] = await sql<{ slot_day: string | null }>(`
      select to_char(
        public.storefront_assert_fulfilment_clock(
          '{"prepMinutes":0,"cutoff":"weekdays after 4","weeklyHours":[],"windows":[]}'::jsonb,
          'delivery',
          null,
          false,
          timestamptz '2026-10-19 23:00:00+02'
        ),
        'YYYY-MM-DD'
      ) as slot_day;
    `);
    expect(row?.slot_day).toBeNull();
  });
});
