import { describe, expect, it } from "vitest";
import { isPublicCachableHttpPath } from "@/lib/http-cache";

describe("public storefront cache paths", () => {
  it("allows marketplace and shop catalogue pages", () => {
    expect(isPublicCachableHttpPath("/")).toBe(true);
    expect(isPublicCachableHttpPath("/market")).toBe(true);
    expect(isPublicCachableHttpPath("/store/craze")).toBe(true);
    expect(isPublicCachableHttpPath("/store/craze/products/shirt")).toBe(true);
  });

  it("never share-caches carts, checkout, orders, or accounts", () => {
    expect(isPublicCachableHttpPath("/store/craze/cart")).toBe(false);
    expect(isPublicCachableHttpPath("/store/craze/checkout")).toBe(false);
    expect(isPublicCachableHttpPath("/store/craze/order/ABC")).toBe(false);
    expect(isPublicCachableHttpPath("/store/craze/account")).toBe(false);
    expect(isPublicCachableHttpPath("/store/craze/search")).toBe(false);
    expect(isPublicCachableHttpPath("/dashboard")).toBe(false);
  });
});
