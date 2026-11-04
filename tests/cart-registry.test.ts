import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listSavedCarts, savedCartCount } from "@/lib/storefront/cart-registry";
import {
  mergeGuestCartIntoUserCart,
  readCart,
  writeCart,
  type CartLine,
} from "@/lib/storefront/cart";

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
    expect(listSavedCarts()).toEqual([{ slug: "alpha-shop", lineCount: 1, totalQuantity: 2 }]);
    expect(savedCartCount()).toBe(1);
  });

  it("sanitizes malformed cart entries before storing them", () => {
    writeCart("alpha-shop", [
      { productId: "a", quantity: 2 },
      { productId: "", quantity: 5 },
      { productId: "a", quantity: -1 },
      { productId: "b", quantity: 1.5 },
      { productId: "c", quantity: 1, note: "   keep\nthis  " },
      { productId: "", quantity: 2, note: "ignored" },
    ] as unknown as CartLine[]);

    expect(readCart("alpha-shop")).toEqual([
      { productId: "a", quantity: 2 },
      { productId: "c", quantity: 1, note: "keep\nthis" },
    ]);
  });

  it("merges a guest cart into a signed-in shopper cart and keeps the guest cart empty", () => {
    writeCart("alpha-shop", [{ productId: "a", quantity: 2 }]);
    writeCart("alpha-shop", [{ productId: "b", quantity: 1 }], "user-1");

    const merged = mergeGuestCartIntoUserCart("alpha-shop", "user-1");

    expect(merged).toEqual([
      { productId: "a", quantity: 2 },
      { productId: "b", quantity: 1 },
    ]);
    expect(readCart("alpha-shop")).toEqual([]);
    expect(readCart("alpha-shop", "user-1")).toEqual([
      { productId: "a", quantity: 2 },
      { productId: "b", quantity: 1 },
    ]);
  });

  it("counts carts stored under a signed-in shopper key as the same shop", () => {
    writeCart("alpha-shop", [{ productId: "a", quantity: 2 }]);
    writeCart("alpha-shop", [{ productId: "b", quantity: 1 }], "user-1");

    expect(listSavedCarts()).toEqual([
      { slug: "alpha-shop", lineCount: 2, totalQuantity: 3 },
    ]);
    expect(savedCartCount()).toBe(2);
  });
});
