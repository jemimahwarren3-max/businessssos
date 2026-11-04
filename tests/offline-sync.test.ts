import { describe, expect, it, vi } from "vitest";
import { syncOnePendingSale, syncPendingSales, type SubmitSale } from "@/lib/offline/sync";
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

  it("keeps a cash sale that failed because the drawer is closed", async () => {
    const db = await import("@/lib/offline/db");
    const seed = db as typeof db & {
      __seed: (rows: PendingSale[]) => void;
      __all: () => PendingSale[];
    };
    seed.__seed([sale("cash-1")]);
    const submit: SubmitSale = async () => {
      throw new Error("Open the cash drawer before taking cash.");
    };
    const result = await syncPendingSales("biz", submit);
    expect(result).toEqual({ synced: 0, failed: 1 });
    expect(seed.__all()[0]?.isClosedDrawer).toBe(true);
    expect(seed.__all()[0]?.error).toMatch(/cash drawer/i);
  });

  it("retries one failed sale without submitting later rows", async () => {
    const db = await import("@/lib/offline/db");
    const seed = db as typeof db & {
      __seed: (rows: PendingSale[]) => void;
      __all: () => PendingSale[];
    };
    const failed: PendingSale = { ...sale("a"), status: "failed", error: "Open the cash drawer" };
    seed.__seed([failed, sale("b")]);
    const seen: string[] = [];
    const submit: SubmitSale = async (row) => {
      seen.push(row.localId);
      return { id: row.localId };
    };
    const result = await syncOnePendingSale("biz", "a", submit);
    expect(result).toEqual({ synced: 1, failed: 0 });
    expect(seen).toEqual(["a"]);
    expect(seed.__all().map((row) => row.localId)).toEqual(["b"]);
  });

  it("keeps a single retry that still fails", async () => {
    const db = await import("@/lib/offline/db");
    const seed = db as typeof db & {
      __seed: (rows: PendingSale[]) => void;
      __all: () => PendingSale[];
    };
    seed.__seed([{ ...sale("cash-1"), status: "failed" }]);
    const submit: SubmitSale = async () => {
      throw new Error("Open the cash drawer before taking cash.");
    };
    const result = await syncOnePendingSale("biz", "cash-1", submit);
    expect(result).toEqual({ synced: 0, failed: 1 });
    expect(seed.__all()[0]?.status).toBe("failed");
    expect(seed.__all()[0]?.isClosedDrawer).toBe(true);
  });

  it("no-ops when the sale is already gone", async () => {
    const db = await import("@/lib/offline/db");
    const seed = db as typeof db & {
      __seed: (rows: PendingSale[]) => void;
    };
    seed.__seed([sale("a")]);
    const submit: SubmitSale = async () => ({ id: "x" });
    const result = await syncOnePendingSale("biz", "missing", submit);
    expect(result).toEqual({ synced: 0, failed: 0 });
  });
});
