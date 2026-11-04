import { describe, expect, it } from "vitest";
import { createProductRpcArgs } from "@/lib/business.server";
import type { ProductInput } from "@/lib/business.schemas";

const honey: ProductInput = {
  businessId: "11111111-1111-4111-8111-111111111111",
  name: "honey",
  sku: "",
  barcode: "",
  unit: "unit",
  costPrice: 0,
  sellingPrice: 3,
  stock: 10,
  minStock: 0,
  taxRate: 0,
  description: "",
  supplierId: "",
};

describe("createProductRpcArgs", () => {
  it("omits _category_id on the onboarding first-product payload", () => {
    const args = createProductRpcArgs(honey);
    expect(args).not.toHaveProperty("_category_id");
    expect(args._name).toBe("honey");
    expect(args._selling_price).toBe(3);
    expect(args._stock).toBe(10);
    expect(args._supplier_id).toBeNull();
    expect(args).not.toHaveProperty("_wholesale_price");
  });

  it("still omits wholesale from create_product when a second price is set", () => {
    expect(createProductRpcArgs({ ...honey, wholesalePrice: 2 })).not.toHaveProperty(
      "_wholesale_price",
    );
  });

  it("omits _category_id when the field is an empty string", () => {
    expect(createProductRpcArgs({ ...honey, categoryId: "" })).not.toHaveProperty("_category_id");
  });

  it("sends _category_id only when a category was chosen", () => {
    const categoryId = "22222222-2222-4222-8222-222222222222";
    expect(createProductRpcArgs({ ...honey, categoryId })._category_id).toBe(categoryId);
  });
});
