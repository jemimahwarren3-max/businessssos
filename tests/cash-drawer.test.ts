import { describe, expect, it } from "vitest";
import { cashDrawerSchema } from "@/lib/cash-drawer.server";

describe("cash drawer contract", () => {
  it("parses a closed drawer", () => {
    const drawer = cashDrawerSchema.parse({ open: false, sessions: [] });
    expect(drawer.open).toBe(false);
    expect(drawer.sessions).toEqual([]);
  });

  it("parses an open drawer and expected cash", () => {
    const drawer = cashDrawerSchema.parse({
      open: true,
      sessionId: "11111111-1111-1111-1111-111111111111",
      openedAt: "2026-10-19T08:00:00+02:00",
      openingFloat: 50,
      expected: 80,
      movements: [
        {
          id: "22222222-2222-2222-2222-222222222222",
          kind: "open_float",
          amount: 50,
          note: "Opening float",
          createdAt: "2026-10-19T08:00:00+02:00",
        },
      ],
      sessions: [],
    });
    expect(drawer.expected).toBe(80);
    expect(drawer.movements?.[0]?.kind).toBe("open_float");
  });
});
