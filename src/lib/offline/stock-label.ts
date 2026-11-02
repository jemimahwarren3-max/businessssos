/** Offline catalogue stock is whatever was cached last time the device was
 * online, minus optimistic decrements from queued sales on this device.
 * Never present it as a live count. */
export const OFFLINE_STOCK_HINT = "Stock estimate from when you were last online";

export function formatStockLeftLabel(
  stock: number,
  unit: string,
  formatQty: (n: number) => string,
  estimate: boolean,
): string {
  if (stock <= 0) {
    return estimate ? "Out of stock (estimate)" : "Out of stock";
  }
  if (estimate) {
    return `About ${formatQty(stock)} ${unit} left (estimate)`;
  }
  return `${formatQty(stock)} ${unit} left`;
}
