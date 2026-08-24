import { createMiddleware } from "@tanstack/react-start";
import { getAuthedContext } from "@/lib/auth/session.server";

// Every business.functions.ts server fn requires this. The session cookie
// travels with the request automatically (it's a normal cookie, just
// encrypted and httpOnly) — there's nothing for client code to attach
// anymore, unlike the old Authorization-header/localStorage approach.
export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const { supabase, userId, claims, tokens } = await getAuthedContext();
    return next({ context: { supabase, userId, claims, tokens } });
  },
);
