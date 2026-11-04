import { describe, expect, it } from "vitest";
import {
  mergeDeliveryZonePresets,
  type DeliveryZone,
  ZIMBABWE_DELIVERY_PRESETS,
} from "@/lib/storefront/delivery-zones";

function zone(name: string, id = name.slice(0, 8)): DeliveryZone {
  return {
    id,
    name,
    enabled: true,
    fee: 12,
    freeOver: null,
    minOrder: 0,
    estimate: "same day",
  };
}

describe("Zimbabwe delivery zone presets", () => {
  it("lists Harare, Bulawayo, and Mutare suburbs", () => {
    expect(ZIMBABWE_DELIVERY_PRESETS.Harare).toContain("Mbare");
    expect(ZIMBABWE_DELIVERY_PRESETS.Bulawayo).toContain("Nkulumane");
    expect(ZIMBABWE_DELIVERY_PRESETS.Mutare).toContain("Dangamvura");
  });

  it("merges missing names with fee 0 and keeps a custom zone of the same name", () => {
    const existing = [zone("Harare CBD")];
    const merged = mergeDeliveryZonePresets(existing, "Harare");
    const cbd = merged.find((item) => item.name === "Harare CBD");
    expect(cbd?.fee).toBe(12);
    expect(cbd?.estimate).toBe("same day");
    const mbare = merged.find((item) => item.name === "Mbare");
    expect(mbare?.fee).toBe(0);
    expect(merged.length).toBeGreaterThan(existing.length);
  });

  it("does not grow past 25 zones", () => {
    const filled: DeliveryZone[] = Array.from({ length: 25 }, (_, index) =>
      zone(`Custom ${index}`, `z${index}`),
    );
    expect(mergeDeliveryZonePresets(filled, "Harare")).toHaveLength(25);
  });
});
