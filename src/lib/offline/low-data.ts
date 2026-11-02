export const LOW_DATA_STORAGE_KEY = "kwetuu-low-data";
export const LOW_DATA_EVENT = "kwetuu-low-data";

export type LowDataPreference = "auto" | "on" | "off";

type NetworkInformationLike = {
  saveData?: boolean;
  addEventListener?(type: string, listener: EventListener): void;
  removeEventListener?(type: string, listener: EventListener): void;
};

export function parseLowDataPreference(value: string | null | undefined): LowDataPreference {
  if (value === "on" || value === "off" || value === "auto") return value;
  return "auto";
}

export function readLowDataPreference(): LowDataPreference {
  if (typeof localStorage === "undefined") return "auto";
  try {
    return parseLowDataPreference(localStorage.getItem(LOW_DATA_STORAGE_KEY));
  } catch {
    return "auto";
  }
}

export function writeLowDataPreference(value: LowDataPreference) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(LOW_DATA_STORAGE_KEY, value);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(LOW_DATA_EVENT));
  }
}

export function readSaveDataHint(): boolean {
  if (typeof navigator === "undefined") return false;
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  return connection?.saveData === true;
}

export function subscribeToSaveData(listener: () => void): () => void {
  if (typeof navigator === "undefined") return () => undefined;
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  connection?.addEventListener?.("change", listener);
  return () => connection?.removeEventListener?.("change", listener);
}

/** `auto` follows the browser Data Saver hint. It is a hint, not a guarantee
 * the network is metered. */
export function resolveLowDataEnabled(preference: LowDataPreference, saveData: boolean): boolean {
  if (preference === "on") return true;
  if (preference === "off") return false;
  return saveData;
}
