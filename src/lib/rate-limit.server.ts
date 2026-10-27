// Postgres-backed rate limiting (see migration 20260808180000_rate_limiting.sql's
// check_rate_limit()) — replaces an in-memory Map that emptied on every
// restart and was never shared across instances. One atomic upsert per
// check means concurrent requests can't race past the limit.
import { createMiddleware, createServerOnlyFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type RateLimitOptions = {
  windowSeconds?: number;
  maxRequests?: number;
  keyPrefix: string;
  message?: string;
};

/** Exported so callers that need to key by something other than a user or
 * IP (e.g. a per-business daily AI-usage cap, keyed by businessId — only
 * known after a function's own Zod validation, one step later than
 * middleware runs) can call the same underlying primitive directly.
 *
 * Wrapped in createServerOnlyFn: this is the one place in the file that
 * actually touches supabaseAdmin/cookies. Without this marker, some
 * client-bundled call sites (confirmed for src/lib/admin/admin.functions.ts)
 * pull this function's module — and its @tanstack/react-start/server import
 * — into the browser bundle and fail to build, even though every real call
 * only ever happens inside a .server()/.handler() callback. */
export const checkRateLimit = createServerOnlyFn(
  async (key: string, limit: number, windowSeconds: number): Promise<boolean> => {
    const { data, error } = await supabaseAdmin.rpc("check_rate_limit", {
      _key: key,
      _limit: limit,
      _window_seconds: windowSeconds,
    });
    if (error) {
      // Fail closed: a down rate-limit table must not become an open door
      // for sign-in, webhooks, or AI spend. Authenticated pages already
      // cannot work if Postgres is unreachable.
      console.error("[rate-limit] check failed", error);
      return false;
    }
    return data === true;
  },
);

/** Per-account sign-in lockout, keyed by email rather than IP — catches a
 * distributed credential-stuffing attempt against one account that stays
 * under signInLimit's per-IP threshold from any single source. Three
 * separate primitives (not checkRateLimit) because lockout only moves on an
 * actual failed password check and resets on success — checkRateLimit
 * counts every call unconditionally and never resets early. */
export const recordLoginFailure = createServerOnlyFn(
  async (key: string, windowSeconds: number): Promise<number> => {
    const { data, error } = await supabaseAdmin.rpc("record_login_failure", {
      _key: key,
      _window_seconds: windowSeconds,
    });
    if (error) {
      console.error("[rate-limit] record login failure failed", error);
      return 0;
    }
    return data ?? 0;
  },
);

export const peekLoginFailures = createServerOnlyFn(
  async (key: string, windowSeconds: number): Promise<number> => {
    const { data, error } = await supabaseAdmin.rpc("peek_login_failures", {
      _key: key,
      _window_seconds: windowSeconds,
    });
    if (error) {
      // Same fail-open stance as checkRateLimit — an infrastructure hiccup
      // here should never itself lock someone out.
      console.error("[rate-limit] peek login failures failed", error);
      return 0;
    }
    return data ?? 0;
  },
);

export const clearLoginFailures = createServerOnlyFn(async (key: string): Promise<void> => {
  const { error } = await supabaseAdmin.rpc("clear_login_failures", { _key: key });
  if (error) console.error("[rate-limit] clear login failures failed", error);
});

/** For endpoints with no session yet — sign-in, sign-up, password reset. */
export function ipRateLimit(options: RateLimitOptions) {
  const windowSeconds = options.windowSeconds ?? 60;
  const maxRequests = options.maxRequests ?? 20;
  const message = options.message ?? "Too many attempts. Please wait a moment and try again.";

  return createMiddleware({ type: "function" }).server(async ({ next }) => {
    const ip = getRequestIP() ?? "unknown";
    const allowed = await checkRateLimit(
      `${options.keyPrefix}:ip:${ip}`,
      maxRequests,
      windowSeconds,
    );
    if (!allowed) throw new Error(message);
    return next();
  });
}

/** For already-authenticated endpoints — composes with requireSupabaseAuth
 * so `context.userId` is properly typed, and keys by user rather than IP
 * (several staff members can share an office network/IP). */
export function authedRateLimit(options: RateLimitOptions) {
  const windowSeconds = options.windowSeconds ?? 60;
  const maxRequests = options.maxRequests ?? 120;
  const message = options.message ?? "Too many requests. Please try again shortly.";

  return createMiddleware({ type: "function" })
    .middleware([requireSupabaseAuth])
    .server(async ({ next, context }) => {
      const allowed = await checkRateLimit(
        `${options.keyPrefix}:user:${context.userId}`,
        maxRequests,
        windowSeconds,
      );
      if (!allowed) throw new Error(message);
      // Explicitly re-pass the context this middleware received (from the
      // composed requireSupabaseAuth) — a bare next() would type this
      // middleware's own contribution as `undefined` to anything composing
      // with it downstream, poisoning every handler's context type even
      // though requireSupabaseAuth's data is still there at runtime.
      return next({ context });
    });
}
