// Optional cache for hot, rarely-changing reads. Fails open on purpose: if
// Upstash isn't configured (no env vars) or is unreachable, every function
// here just no-ops and callers fall straight through to Postgres — exactly
// the behavior this app already had before Redis existed. A cache outage
// must never become an application outage.
//
// This is never a substitute for RLS or role checks — every actual data
// mutation still goes through Postgres's own security-definer role checks
// on every call, regardless of what's cached here. This only saves
// re-fetching the same read (e.g. "what business/role/plan is this user
// in") across requests within its TTL.
import { Redis } from "@upstash/redis";

let client: Redis | null | undefined;

function getClient(): Redis | null {
  if (client !== undefined) return client;
  const url = process.env["UPSTASH_REDIS_REST_URL"];
  const token = process.env["UPSTASH_REDIS_REST_TOKEN"];
  client = url && token ? new Redis({ url, token }) : null;
  return client;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getClient();
  if (!redis) return null;
  try {
    return await redis.get<T>(key);
  } catch (error) {
    console.error("[cache] get failed, falling back to source", error);
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const redis = getClient();
  if (!redis) return;
  try {
    await redis.set(key, value, { ex: ttlSeconds });
  } catch (error) {
    console.error("[cache] set failed", error);
  }
}

export async function cacheDel(key: string): Promise<void> {
  const redis = getClient();
  if (!redis) return;
  try {
    await redis.del(key);
  } catch (error) {
    console.error("[cache] del failed", error);
  }
}

export function workspaceCacheKey(userId: string): string {
  return `workspace:${userId}`;
}
