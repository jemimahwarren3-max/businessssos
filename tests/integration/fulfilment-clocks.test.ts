import { expect, it } from "vitest";
import { describeStaging, sql } from "./helpers";

const hours = `{
  "prepMinutes": 30,
  "timezone": "Africa/Harare",
  "weeklyHours": [{"weekday": 1, "open": "08:00", "close": "17:00"}],
  "windows": [{"weekday": 1, "start": "10:00", "end": "12:00"}],
  "cutoffTime": "16:00"
}`;

describeStaging("fulfilment clocks SQL", () => {
  it("allows a Monday morning pickup slot and refuses a closed delivery", async () => {
    const [ok] = await sql<{ storefront_assert_fulfilment_clock: string }>(`
      select public.storefront_assert_fulfilment_clock(
        '${hours}'::jsonb,
        'pickup',
        '2026-10-19T10:00:00+02:00'::timestamptz,
        true,
        '2026-10-19T08:30:00+02:00'::timestamptz
      );
    `);
    expect(ok?.storefront_assert_fulfilment_clock).toContain("2026-10-19");

    await expect(
      sql(`
        select public.storefront_assert_fulfilment_clock(
          '${hours}'::jsonb,
          'delivery',
          null,
          false,
          '2026-10-19T17:30:00+02:00'::timestamptz
        );
      `),
    ).rejects.toThrow(/closed right now/i);
  });

  it("does not treat free-text cut-off as a clock", async () => {
    const [row] = await sql<{ storefront_assert_fulfilment_clock: string | null }>(`
      select public.storefront_assert_fulfilment_clock(
        '{"prepMinutes":0,"cutoff":"weekdays after 4","weeklyHours":[],"windows":[]}'::jsonb,
        'delivery',
        null,
        false,
        '2026-10-19T23:00:00+02:00'::timestamptz
      );
    `);
    expect(row?.storefront_assert_fulfilment_clock).toBeNull();
  });
});
