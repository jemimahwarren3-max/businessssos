import { describe, expect, it } from "vitest";
import {
  clocksCopy,
  hasCollectionWindows,
  isOpenAt,
  placeOrderBlockedReason,
  upcomingCollectionSlots,
  type ClockDelivery,
} from "@/lib/storefront/clocks";

const mondayMorning = new Date("2026-10-19T08:30:00+02:00");
const mondayEvening = new Date("2026-10-19T17:30:00+02:00");
const mondayLate = new Date("2026-10-19T16:30:00+02:00");

const openWeek: ClockDelivery = {
  prepMinutes: 30,
  cutoff: "16:00",
  cutoffTime: "16:00",
  collectionWindows: "",
  timezone: "Africa/Harare",
  weeklyHours: [{ weekday: 1, open: "08:00", close: "17:00" }],
  windows: [
    { weekday: 1, start: "10:00", end: "12:00" },
    { weekday: 1, start: "15:00", end: "17:00" },
  ],
};

describe("fulfilment clocks", () => {
  it("treats unstructured shops as always open", () => {
    const shop: ClockDelivery = {
      prepMinutes: 0,
      cutoff: "Ask in store",
      collectionWindows: "Afternoons",
      weeklyHours: [],
      windows: [],
    };
    expect(placeOrderBlockedReason(shop, "pickup", mondayEvening)).toBeNull();
    expect(hasCollectionWindows(shop)).toBe(false);
    expect(clocksCopy(shop).some((line) => line.includes("not a clock"))).toBe(true);
  });

  it("refuses same-day delivery after close or cut-off", () => {
    const noWindows = { ...openWeek, windows: [] };
    expect(isOpenAt(noWindows, 1, 8 * 60 + 30)).toBe(true);
    expect(placeOrderBlockedReason(noWindows, "delivery", mondayEvening)).toBe(
      "This shop is closed right now.",
    );
    expect(placeOrderBlockedReason(noWindows, "delivery", mondayLate)).toBe(
      "The order cut-off for today has passed.",
    );
    expect(placeOrderBlockedReason(noWindows, "quote", mondayEvening)).toBeNull();
  });

  it("lists remaining pickup windows after preparation time", () => {
    const slots = upcomingCollectionSlots(openWeek, mondayMorning);
    expect(slots.map((slot) => slot.start)).toEqual(["10:00", "15:00"]);
    const afterCutoff = upcomingCollectionSlots(openWeek, mondayLate);
    expect(afterCutoff.every((slot) => !slot.label.includes("Monday"))).toBe(true);
  });
});
