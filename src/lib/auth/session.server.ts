// The session of record. The Supabase access/refresh token pair lives here —
// in a server-side, AES-encrypted + HMAC-signed, httpOnly cookie (TanStack
// Start's built-in session primitive, the same mechanism as iron-session) —
// and nowhere else. The browser never sees it, so there's nothing for an XSS
// payload to steal.
import { createClient } from "@supabase/supabase-js";
import {
  clearSession,
  deleteCookie,
  getCookie,
  getSession,
  updateSession,
  type SessionConfig,
} from "@tanstack/react-start/server";
import { SUPABASE_AUTH_STORAGE_KEY } from "@/integrations/supabase/auth-storage-key";
import { isSessionCookieSecure } from "@/lib/auth/session-cookie";
import { createSupabaseFetch } from "@/integrations/supabase/supabase-fetch";
import type { Database } from "@/integrations/supabase/types";

export type SupabaseTokens = { accessToken: string; refreshToken: string };

function sessionConfig(): SessionConfig {
  const password = process.env["SESSION_SECRET"];
  if (!password || password.length < 32) {
    throw new Error(
      "Missing SESSION_SECRET environment variable, generate 32+ random characters and set it in .env.",
    );
  }
  return {
    password,
    name: "businessos_session",
    // 30 days — comfortably covers Supabase's refresh token lifetime; the
    // access token itself is refreshed well before it expires (see
    // getAuthedContext below), this just bounds how long a fully-idle
    // session can sit before needing a fresh sign-in.
    maxAge: 60 * 60 * 24 * 30,
    // The default cookie (httpOnly + secure + path "/") doesn't set
    // SameSite explicitly — confirmed live via curl (missing from the
    // Set-Cookie header). Setting it ourselves rather than relying on
    // browsers' implicit Lax default, on top of the CSRF middleware in
    // start.ts (belt and suspenders, same reasoning as elsewhere this pass).
    cookie: {
      httpOnly: true,
      secure: isSessionCookieSecure(process.env["APP_URL"]),
      path: "/",
      sameSite: "lax",
    },
  };
}

function getSupabaseEnv() {
  const SUPABASE_URL = process.env["SUPABASE_URL"];
  const SUPABASE_PUBLISHABLE_KEY = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error(
      "Missing SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY environment variable(s). Set them in your .env file.",
    );
  }
  return { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY };
}

export function createAnonClient() {
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = getSupabaseEnv();
  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY) },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

// exchangeCodeForSession() reads the PKCE code_verifier from the client
// instance's own configured `storage` — it never accepts it as a plain
// argument. The browser wrote that verifier into a cookie (client.ts); this
// adapter reads it back out of the *incoming request's* cookies via
// TanStack's ambient getCookie(), which only works from inside real request
// handling (a server fn, or — as used here — a route's beforeLoad during
// SSR). storageKey must match the browser client's exactly, hence the
// shared constant.
const requestCookieStorage = {
  getItem(key: string): string | null {
    return getCookie(key) ?? getCookie(encodeURIComponent(key)) ?? null;
  },
  setItem(): void {
    // The browser already wrote this cookie; the exchange client never
    // needs to write one back.
  },
  removeItem(key: string): void {
    deleteCookie(key);
  },
};

export function createExchangeClient() {
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = getSupabaseEnv();
  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY) },
    auth: {
      flowType: "pkce",
      storageKey: SUPABASE_AUTH_STORAGE_KEY,
      storage: requestCookieStorage,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function createTokenScopedClient(accessToken: string) {
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = getSupabaseEnv();
  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: {
      fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY),
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

export async function setServerSession(tokens: SupabaseTokens): Promise<void> {
  await updateSession<SupabaseTokens>(sessionConfig(), tokens);
}

export async function clearServerSession(): Promise<void> {
  await clearSession(sessionConfig());
}

export class UnauthenticatedError extends Error {}

export type AuthedContext = {
  supabase: ReturnType<typeof createTokenScopedClient>;
  userId: string;
  claims: Record<string, unknown>;
  tokens: SupabaseTokens;
};

// The bearer-header client above (createTokenScopedClient) is enough for
// every normal RLS-scoped query, but auth.mfa.* methods read the SDK's own
// in-memory session state, not just a header — they need a client that's
// actually been through auth.setSession(). Kept separate from the default
// path since most callers never touch MFA and don't need this extra
// round-trip.
export async function createMfaScopedClient(tokens: SupabaseTokens) {
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = getSupabaseEnv();
  const client = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY) },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.setSession({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  });
  if (error) throw new UnauthenticatedError("Could not establish MFA session.");
  return client;
}

async function verifyToken(accessToken: string) {
  const client = createTokenScopedClient(accessToken);
  const { data, error } = await client.auth.getClaims(accessToken);
  return { client, data, error };
}

/**
 * Reads the sealed session cookie, verifies the access token, and
 * transparently refreshes + reseals it if expired. Throws
 * UnauthenticatedError (never returns a falsy "not logged in" value) so
 * callers can't accidentally treat a failed check as success.
 */
export async function getAuthedContext(): Promise<AuthedContext> {
  const session = await getSession<SupabaseTokens>(sessionConfig());
  const { accessToken, refreshToken } = session.data;
  if (!accessToken || !refreshToken) {
    throw new UnauthenticatedError("No session.");
  }

  let tokens: SupabaseTokens = { accessToken, refreshToken };
  let { client, data, error } = await verifyToken(accessToken);

  if (error || !data?.claims?.sub) {
    const { data: refreshed, error: refreshError } = await createAnonClient().auth.refreshSession({
      refresh_token: refreshToken,
    });
    if (refreshError || !refreshed.session) {
      await clearServerSession();
      throw new UnauthenticatedError("Session expired.");
    }

    tokens = {
      accessToken: refreshed.session.access_token,
      refreshToken: refreshed.session.refresh_token,
    };
    await setServerSession(tokens);

    ({ client, data, error } = await verifyToken(tokens.accessToken));
    if (error || !data?.claims?.sub) {
      await clearServerSession();
      throw new UnauthenticatedError("Session invalid after refresh.");
    }
  }

  return { supabase: client, userId: data.claims.sub, claims: data.claims, tokens };
}

/** Same as getAuthedContext, but returns null instead of throwing — for
 * places that need to know "is anyone logged in" without treating "no" as
 * an error (the auth pages' redirect-if-already-signed-in check, the
 * `_authenticated` route guard before it does its own redirect). */
export async function tryGetAuthedContext(): Promise<AuthedContext | null> {
  try {
    return await getAuthedContext();
  } catch {
    return null;
  }
}
