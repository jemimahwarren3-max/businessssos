/** Per-instance cache for public reads. Failed loads are not cached. */
export function ttlCache<T>(ttlMs: number, maxEntries = 50) {
  const entries = new Map<string, { value: T; expires: number }>();

  return async function cached(key: string, load: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const hit = entries.get(key);
    if (hit && hit.expires > now) return hit.value;

    const value = await load();
    if (entries.size >= maxEntries) entries.clear();
    entries.set(key, { value, expires: now + ttlMs });
    return value;
  };
}
