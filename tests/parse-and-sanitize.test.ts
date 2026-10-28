import { describe, expect, it } from "vitest";
import { createBusinessSchema } from "@/lib/business.schemas";
import { coalesceServerFnData, parseAndSanitize } from "@/lib/security";

describe("parseAndSanitize", () => {
  it("unwraps nested server-fn data payloads", () => {
    const inner = {
      name: "Kantuu",
      businessType: "grocery" as const,
      currency: "USD",
      phone: "",
      address: "",
    };
    expect(parseAndSanitize(createBusinessSchema, { data: inner })).toEqual(inner);
  });

  it("throws a plain Error (not ZodError) on invalid input", () => {
    expect(() => parseAndSanitize(createBusinessSchema, { name: "x" })).toThrow(Error);
    try {
      parseAndSanitize(createBusinessSchema, { name: "x" });
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toHaveProperty("issues");
      expect(String((error as Error).message).length).toBeGreaterThan(0);
    }
  });

  it("coalesceServerFnData leaves flat payloads unchanged", () => {
    const flat = { name: "Shop", businessType: "grocery", currency: "USD" };
    expect(coalesceServerFnData(flat)).toBe(flat);
  });
});
