import { describe, expect, it, vi } from "vitest";
import { syncPendingSales, type SubmitSale } from "@/lib/offline/sync";
import type { PendingSale } from "@/lib/offline/db";

vi.mock("@/lib/offline/db", () => {
  const sales: PendingSale[] = [];
  return {
    listPendingSales: async (businessId: string) =>
      sales.filter((sale) => sale.businessId === businessId),
    updatePendingSale: async (localId: string, patch: Partial<PendingSale>) => {
      const row = sales.find((sale) => sale.localId === localId);
      if (row) Object.assign(row, patch);
    },
    removePendingSale: async (localId: string) => {
      const index = sales.findIndex((sale) => sale.localId === localId);
      if (index >= 0) sales.splice(index, 1);
    },
    __seed: (rows: PendingSale[]) => {
      sales.length = 0;
      sales.push(...rows);
    },
    __all: () => sales,
  };
});

function sale(id: string): PendingSale {
  return {
    localId: id,
    businessId: "biz",
    idempotencyKey: `key-${id}`,
    customerId: "",
    discount: 0,
    paymentMethod: "cash",
    items: [{ productId: "p1", quantity: 1, unitPrice: 10 }],
    createdAt: id,
    status: "pending",
  };
}

describe("offline sale sync", () => {
  it("replays queued sales in order and stops double-submit after success", async () => {
    const db = await import("@/lib/offline/db");
    const seed = db as typeof db & {
      __seed: (rows: PendingSale[]) => void;
      __all: () => PendingSale[];
    };
    seed.__seed([sale("a"), sale("b")]);
    const seen: string[] = [];
    const submit: SubmitSale = async (row) => {
      seen.push(row.idempotencyKey);
      return { id: row.localId };
    };
    const result = await syncPendingSales("biz", submit);
    expect(result).toEqual({ synced: 2, failed: 0 });
    expect(seen).toEqual(["key-a", "key-b"]);
    expect(seed.__all()).toEqual([]);
  });

  it("keeps a failed sale and does not drop later ones", async () => {
    const db = await import("@/lib/offline/db");
    const seed = db as typeof db & {
      __seed: (rows: PendingSale[]) => void;
      __all: () => PendingSale[];
    };
    seed.__seed([sale("a"), sale("b")]);
    const submit: SubmitSale = async (row) => {
      if (row.localId === "a") throw new Error("Not enough stock");
      return { id: row.localId };
    };
    const result = await syncPendingSales("biz", submit);
    expect(result).toEqual({ synced: 1, failed: 1 });
    expect(seed.__all()[0]?.status).toBe("failed");
    expect(seed.__all()[0]?.isOverSold).toBe(true);
  });
});
