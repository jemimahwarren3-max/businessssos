import { createMiddleware } from "@tanstack/react-start";
import { getMfaStatus } from "@/lib/auth/mfa.server";
import { getAuthedContext } from "@/lib/auth/session.server";

/** Compose before requireSupabaseAuth on MFA enroll/verify so an aal1
 * session can still complete the authenticator challenge. */
export const allowAal1Session = createMiddleware({ type: "function" }).server(async ({ next }) =>
  next({ context: { allowAal1: true as const } }),
);

// Every business.functions.ts server fn requires this. The session cookie
// travels with the request automatically (it's a normal cookie, just
// encrypted and httpOnly) — there's nothing for client code to attach
// anymore, unlike the old Authorization-header/localStorage approach.
// If the user enrolled TOTP, writes and reads that use this middleware
// require aal2. The React MFA gate is not enough on its own.
export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next, context }) => {
    const { supabase, userId, claims, tokens } = await getAuthedContext();
    const allowAal1 = Boolean((context as unknown as { allowAal1?: boolean }).allowAal1);
    if (!allowAal1) {
      const mfa = await getMfaStatus(tokens);
      if (mfa.enrolled && mfa.currentLevel !== "aal2") {
        throw new Error("Enter the code from your authenticator to continue.");
      }
    }
    return next({ context: { supabase, userId, claims, tokens } });
  },
);
