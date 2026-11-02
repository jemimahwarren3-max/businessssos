import { listPendingSales, removePendingSale, updatePendingSale, type PendingSale } from "./db";

export type SubmitSale = (sale: PendingSale) => Promise<{ id: string }>;

export type SyncProgress = { localId: string; status: PendingSale["status"]; error?: string };

function failurePatch(error: unknown): {
  status: "failed";
  error: string;
  isOverSold: boolean;
  isClosedDrawer: boolean;
} {
  const message = error instanceof Error ? error.message : "Couldn't sync this sale.";
  const isOverSold = /not enough stock|out of stock/i.test(message);
  const isClosedDrawer = /open the cash drawer/i.test(message);
  return {
    status: "failed",
    error: isClosedDrawer ? "Open the cash drawer, then tap Sync now." : message,
    isOverSold,
    isClosedDrawer,
  };
}

async function attemptSale(
  sale: PendingSale,
  submitSale: SubmitSale,
  onProgress?: (update: SyncProgress) => void,
): Promise<"synced" | "failed"> {
  await updatePendingSale(sale.localId, { status: "syncing" });
  onProgress?.({ localId: sale.localId, status: "syncing" });
  try {
    await submitSale(sale);
    await removePendingSale(sale.localId);
    onProgress?.({ localId: sale.localId, status: "pending" });
    return "synced";
  } catch (error) {
    const patch = failurePatch(error);
    await updatePendingSale(sale.localId, patch);
    onProgress?.({ localId: sale.localId, status: "failed", error: patch.error });
    return "failed";
  }
}

/**
 * Replays queued offline sales against the real create_sale RPC, one at a
 * time and in the order they were made — never in parallel, so the server's
 * own stock check (which re-reads current stock fresh at sync time) is the
 * single source of truth for conflicts. If two offline sales together
 * oversold, the first to sync wins and the second comes back with a clear
 * "not enough stock" error instead of silently succeeding.
 *
 * Each sale carries the same idempotency key it was queued with, so a sync
 * that fails partway (e.g. connection drops mid-loop) can safely resume
 * without double-booking anything already synced.
 */
export async function syncPendingSales(
  businessId: string,
  submitSale: SubmitSale,
  onProgress?: (update: SyncProgress) => void,
): Promise<{ synced: number; failed: number }> {
  const queue = await listPendingSales(businessId);
  let synced = 0;
  let failed = 0;

  for (const sale of queue) {
    const result = await attemptSale(sale, submitSale, onProgress);
    if (result === "synced") synced++;
    else failed++;
  }

  return { synced, failed };
}

/** Cashier retry for one dead-lettered sale. Does not touch later rows, so a
 * closed-drawer cash sale can be retried after the till is opened without a
 * developer clearing the queue. */
export async function syncOnePendingSale(
  businessId: string,
  localId: string,
  submitSale: SubmitSale,
  onProgress?: (update: SyncProgress) => void,
): Promise<{ synced: number; failed: number }> {
  const queue = await listPendingSales(businessId);
  const sale = queue.find((row) => row.localId === localId);
  if (!sale) return { synced: 0, failed: 0 };
  const result = await attemptSale(sale, submitSale, onProgress);
  return result === "synced" ? { synced: 1, failed: 0 } : { synced: 0, failed: 1 };
}
