import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listSavedCarts, savedCartCount } from "@/lib/storefront/cart-registry";
import { writeCart } from "@/lib/storefront/cart";

function mockLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  });
}

describe("cart registry", () => {
  beforeEach(() => {
    mockLocalStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists only non-empty per-shop carts", () => {
    writeCart("alpha-shop", [{ productId: "a", quantity: 2 }]);
    writeCart("beta-shop", []);
    expect(listSavedCarts()).toEqual([
      { slug: "alpha-shop", lineCount: 1, totalQuantity: 2 },
    ]);
    expect(savedCartCount()).toBe(1);
  });
});
