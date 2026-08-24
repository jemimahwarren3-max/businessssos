import { createClient } from "@supabase/supabase-js";
import { SUPABASE_AUTH_STORAGE_KEY } from "./auth-storage-key";
import { createSupabaseFetch } from "./supabase-fetch";
import type { Database } from "./types";

// The real session (access + refresh token) never touches the browser —
// it lives server-side in an httpOnly, encrypted cookie (see
// lib/auth/session.server.ts). This client only ever needs to (a) kick off
// the Google OAuth redirect and (b) briefly hold the PKCE code_verifier that
// flow generates until /auth/callback exchanges it server-side.
//
// supabase-js ties both of those to the same `storage` option (keyed
// `<storageKey>` for the session, `<storageKey>-code-verifier` for the
// PKCE verifier) and — critically — only honors a custom `storage` adapter
// at all when `persistSession: true`; with it `false` it silently falls
// back to an in-memory store that a full-page OAuth redirect would wipe,
// breaking the flow. So persistSession has to stay true, and this adapter
// selectively passes only the `-code-verifier` key through to a real
// (short-lived, non-httpOnly — it's a single-use nonce, not a credential)
// cookie; everything else, including the actual session object, is routed
// to a plain in-memory Map that's discarded on reload instead.
const ephemeralMemory = new Map<string, string>();

const authStorage = {
  getItem(key: string) {
    if (!key.endsWith("-code-verifier")) return ephemeralMemory.get(key) ?? null;
    if (typeof document === "undefined") return null;
    const match = document.cookie.match(new RegExp(`(?:^|; )${encodeURIComponent(key)}=([^;]*)`));
    return match ? decodeURIComponent(match[1] ?? "") : null;
  },
  setItem(key: string, value: string) {
    if (!key.endsWith("-code-verifier")) {
      ephemeralMemory.set(key, value);
      return;
    }
    if (typeof document === "undefined") return;
    document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}; path=/; max-age=600; SameSite=Lax`;
  },
  removeItem(key: string) {
    if (!key.endsWith("-code-verifier")) {
      ephemeralMemory.delete(key);
      return;
    }
    if (typeof document === "undefined") return;
    document.cookie = `${encodeURIComponent(key)}=; path=/; max-age=0; SameSite=Lax`;
  },
};

function createSupabaseClient() {
  // Use import.meta.env for client-side (Vite build-time replacement)
  // Fall back to process.env for SSR (server-side rendering)
  const SUPABASE_URL = import.meta.env["VITE_SUPABASE_URL"] || process.env["SUPABASE_URL"];
  const SUPABASE_PUBLISHABLE_KEY =
    import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] || process.env["SUPABASE_PUBLISHABLE_KEY"];

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    const missing = [
      ...(!SUPABASE_URL ? ["SUPABASE_URL"] : []),
      ...(!SUPABASE_PUBLISHABLE_KEY ? ["SUPABASE_PUBLISHABLE_KEY"] : []),
    ];
    const message = `Missing Supabase environment variable(s): ${missing.join(", ")}. Set them in your .env file.`;
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: {
      fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY),
    },
    auth: {
      flowType: "pkce",
      storageKey: SUPABASE_AUTH_STORAGE_KEY,
      storage: authStorage,
      persistSession: true,
      autoRefreshToken: false,
    },
  });
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});
