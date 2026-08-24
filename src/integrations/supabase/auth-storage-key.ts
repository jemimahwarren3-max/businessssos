// Shared between the browser client (client.ts, which stores the PKCE
// code_verifier under `${key}-code-verifier` in a plain cookie during the
// OAuth/magic-link handoff) and the server-side exchange client
// (lib/auth/session.server.ts, which reads that same cookie back to
// complete exchangeCodeForSession). Both sides must agree on this exact
// value — plain constant, safe to import from client or server code.
export const SUPABASE_AUTH_STORAGE_KEY = "businessos-auth";
