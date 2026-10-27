import { describe, expect, it } from "vitest";
import { productCreateFieldsSchema } from "@/lib/business.schemas";

describe("product create form schema", () => {
  it("rejects a missing name and a negative price", () => {
    const missing = productCreateFieldsSchema.safeParse({
      name: " ",
      unit: "unit",
      costPrice: 1,
      sellingPrice: 2,
      stock: 0,
      minStock: 0,
      taxRate: 0,
    });
    expect(missing.success).toBe(false);

    const negative = productCreateFieldsSchema.safeParse({
      name: "Sugar",
      unit: "kg",
      costPrice: 1,
      sellingPrice: -2,
      stock: 0,
      minStock: 0,
      taxRate: 0,
    });
    expect(negative.success).toBe(false);
  });

  it("accepts a valid product and coerces numeric strings", () => {
    const parsed = productCreateFieldsSchema.parse({
      name: "2kg White Sugar",
      sku: "SUG-2",
      unit: "bag",
      costPrice: "3.5",
      sellingPrice: "5",
      stock: "12",
      minStock: "2",
      taxRate: "0",
      description: "",
      supplierId: "",
    });
    expect(parsed.sellingPrice).toBe(5);
    expect(parsed.stock).toBe(12);
  });
});
