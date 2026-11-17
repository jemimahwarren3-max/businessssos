import { describe, expect, it } from "vitest";
import { pickBestProductMatch, scoreProductName } from "../src/lib/quick-entry-product-match";

describe("scoreProductName", () => {
  it("prefers exact and substring matches", () => {
    expect(scoreProductName("Mazoe Orange", "Mazoe Orange 2L")).toBeGreaterThanOrEqual(80);
    expect(scoreProductName("mazoe", "Mazoe Orange 2L")).toBeGreaterThanOrEqual(60);
  });

  it("matches informal descriptions to catalogue names", () => {
    expect(scoreProductName("orange drink", "Mazoe Orange Drink 2L")).toBeGreaterThanOrEqual(42);
  });
});

describe("pickBestProductMatch", () => {
  const catalogue = [
    { id: "1", name: "Blue Bar Soap 500g" },
    { id: "2", name: "Mazoe Orange Drink 2L" },
    { id: "3", name: "Bread White" },
  ];

  it("picks the closest product when tokens overlap", () => {
    const match = pickBestProductMatch("2L orange mazoe", catalogue);
    expect(match?.id).toBe("2");
  });

  it("returns undefined when nothing is close enough", () => {
    expect(pickBestProductMatch("laptop charger", catalogue)).toBeUndefined();
  });
});
