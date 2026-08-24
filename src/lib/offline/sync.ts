import { listPendingSales, removePendingSale, updatePendingSale, type PendingSale } from "./db";

export type SubmitSale = (sale: PendingSale) => Promise<{ id: string }>;

export type SyncProgress = { localId: string; status: PendingSale["status"]; error?: string };

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
    await updatePendingSale(sale.localId, { status: "syncing" });
    onProgress?.({ localId: sale.localId, status: "syncing" });
    try {
      await submitSale(sale);
      await removePendingSale(sale.localId);
      synced++;
      onProgress?.({ localId: sale.localId, status: "pending" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Couldn't sync this sale.";
      const isOverSold = /not enough stock|out of stock/i.test(message);
      await updatePendingSale(sale.localId, {
        status: "failed",
        error: message,
        isOverSold,
      });
      failed++;
      onProgress?.({ localId: sale.localId, status: "failed", error: message });
    }
  }

  return { synced, failed };
}
