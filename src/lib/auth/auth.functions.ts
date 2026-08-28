import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";
import { getAppUrl } from "@/lib/app-url.server";
import { deleteMyAccount } from "@/lib/account-deletion.server";
import type { Db } from "@/lib/business.server";
import { recordLegalAcceptance } from "@/lib/legal-acceptance.server";
import { authedRateLimit, ipRateLimit } from "@/lib/rate-limit.server";
import { isPasswordBreached } from "./breach-check.server";
import {
  challengeTotp,
  enrollTotp,
  getMfaStatus,
  unenrollTotp,
  verifyTotpChallenge,
  verifyTotpEnrollment,
} from "./mfa.server";
import {
  clearServerSession,
  createAnonClient,
  createExchangeClient,
  setServerSession,
  tryGetAuthedContext,
} from "./session.server";

// Keyed by IP (there's no session yet at this point) — deliberately tight,
// these are exactly the endpoints someone would script a credential-
// stuffing or account-enumeration attempt against.
const signInLimit = [
  ipRateLimit({ keyPrefix: "auth-signin", maxRequests: 10, windowSeconds: 60 }),
] as const;
const signUpLimit = [
  ipRateLimit({ keyPrefix: "auth-signup", maxRequests: 5, windowSeconds: 60 }),
] as const;
const resetLimit = [
  ipRateLimit({ keyPrefix: "auth-reset", maxRequests: 5, windowSeconds: 60 }),
] as const;
const deleteAccountLimit = [
  authedRateLimit({ keyPrefix: "auth-delete-account", maxRequests: 3, windowSeconds: 60 }),
] as const;
const oauthCallbackLimit = [
  ipRateLimit({ keyPrefix: "auth-oauth-callback", maxRequests: 10, windowSeconds: 60 }),
] as const;
const updatePasswordLimit = [
  authedRateLimit({ keyPrefix: "auth-update-password", maxRequests: 5, windowSeconds: 60 }),
] as const;
// Same "authedRateLimit already composes requireSupabaseAuth" reasoning as
// admin.functions.ts — context.tokens is available with no other wiring.
// Tighter than the general API limit: these accept a 6-digit TOTP code,
// exactly the kind of surface that normally gets a tight attempt throttle.
const mfaLimit = [
  authedRateLimit({ keyPrefix: "mfa", maxRequests: 8, windowSeconds: 60 }),
] as const;

const emailSchema = z.string().trim().toLowerCase().email();
const passwordSchema = z.string().min(8, "Use at least 8 characters.");

const signInSchema = z.object({ email: emailSchema, password: z.string().min(1) });
const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: z.string().trim().min(1).max(120),
  acceptedTerms: z.literal(true, {
    message: "You must accept the Terms of Service and Privacy Policy.",
  }),
});
const requestResetSchema = z.object({ email: emailSchema });
const updatePasswordSchema = z.object({ password: passwordSchema });

async function establishSession(session: { access_token: string; refresh_token: string }) {
  await setServerSession({
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
  });
}

export const signIn = createServerFn({ method: "POST" })
  .middleware(signInLimit)
  .inputValidator((data: unknown) => signInSchema.parse(data))
  .handler(async ({ data }) => {
    const { data: result, error } = await createAnonClient().auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    // Deliberately the same message whether the email doesn't exist or the
    // password is wrong — distinguishing the two tells an attacker which
    // emails have accounts.
    if (error || !result.session) {
      throw new Error("Incorrect email or password.");
    }
    await establishSession(result.session);
    return { userId: result.user.id };
  });

const BREACHED_PASSWORD_MESSAGE =
  "That password has appeared in known data breaches, so it's not safe to use. Please choose a different one.";

function friendlySignUpError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("password")) return "Your password must be at least 8 characters.";
  if (m.includes("email") && (m.includes("invalid") || m.includes("valid"))) {
    return "Please enter a valid email address.";
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  // Anything else — including "already registered" — gets a generic
  // message rather than confirming or denying the email is already in use.
  return "We couldn't create that account. Please try again.";
}

export const signUp = createServerFn({ method: "POST" })
  .middleware(signUpLimit)
  .inputValidator((data: unknown) => signUpSchema.parse(data))
  .handler(async ({ data }) => {
    if (await isPasswordBreached(data.password)) {
      throw new Error(BREACHED_PASSWORD_MESSAGE);
    }
    const { data: result, error } = await createAnonClient().auth.signUp({
      email: data.email,
      password: data.password,
      options: { data: { full_name: data.fullName } },
    });
    if (error) throw new Error(friendlySignUpError(error.message));

    if (result.user) {
      await recordLegalAcceptance(result.user.id, getRequestIP() ?? null);
    }

    if (result.session) {
      await establishSession(result.session);
      return { needsEmailConfirmation: false };
    }
    // Whether this is a new signup awaiting confirmation or an email that
    // already has an account, Supabase's response — and ours — look
    // identical on purpose; see friendlySignUpError above.
    return { needsEmailConfirmation: true };
  });

export const requestPasswordReset = createServerFn({ method: "POST" })
  .middleware(resetLimit)
  .inputValidator((data: unknown) => requestResetSchema.parse(data))
  .handler(async ({ data }) => {
    await createAnonClient().auth.resetPasswordForEmail(data.email, {
      redirectTo: `${getAppUrl()}/auth/callback?next=/reset-password`,
    });
    // Always looks the same to the caller, regardless of whether the email
    // has an account — same reasoning as signUp above.
    return { ok: true };
  });

// Called from routes/auth.callback.tsx's beforeLoad — the server-side half
// of the PKCE OAuth/magic-link handoff. The browser holds the code_verifier
// (see integrations/supabase/client.ts's cookie-backed storage adapter);
// Supabase's SDK reads it back out of that same cookie via this request.
export const exchangeOAuthCode = createServerFn({ method: "POST" })
  .middleware(oauthCallbackLimit)
  .inputValidator((data: unknown) =>
    z.object({ code: z.string().min(1), acceptedTerms: z.boolean().optional() }).parse(data),
  )
  .handler(async ({ data }) => {
    const { data: result, error } = await createExchangeClient().auth.exchangeCodeForSession(
      data.code,
    );
    if (error || !result.session) {
      throw new Error("That sign-in link is invalid or has expired.");
    }
    // Only set when the auth page's sign-up tab (with its required
    // checkbox) initiated this OAuth flow — a plain sign-in never sends it,
    // so an existing user re-authenticating doesn't get a spurious new row.
    if (data.acceptedTerms) {
      await recordLegalAcceptance(result.user.id, getRequestIP() ?? null);
    }
    await establishSession(result.session);
    return { ok: true };
  });

// Deliberately unguarded: called via tryGetAuthedContext() on effectively
// every authenticated page load/navigation, not just deliberate user
// actions. A rate limit here would risk locking out normal browsing, not
// attackers — the real security boundary for these is auth/RLS, not
// throttling.
export const signOutFn = createServerFn({ method: "POST" }).handler(async () => {
  const ctx = await tryGetAuthedContext();
  if (ctx) {
    await ctx.supabase.auth.signOut();
  }
  await clearServerSession();
  return { ok: true };
});

export const getCurrentUser = createServerFn({ method: "GET" }).handler(async () => {
  const ctx = await tryGetAuthedContext();
  if (!ctx) return null;
  const email = (ctx.claims as { email?: string }).email ?? null;
  return { userId: ctx.userId, email };
});

export const updatePassword = createServerFn({ method: "POST" })
  .middleware(updatePasswordLimit)
  .inputValidator((data: unknown) => updatePasswordSchema.parse(data))
  .handler(async ({ data, context }) => {
    if (await isPasswordBreached(data.password)) {
      throw new Error(BREACHED_PASSWORD_MESSAGE);
    }
    const { error } = await context.supabase.auth.updateUser({ password: data.password });
    if (error) throw new Error("Couldn't update your password. Please try again.");
    return { ok: true };
  });

export const deleteAccountFn = createServerFn({ method: "POST" })
  .middleware(deleteAccountLimit)
  .handler(async ({ context }) => {
    await deleteMyAccount(context.supabase as Db, context.userId);
    await clearServerSession();
    return { ok: true };
  });

/* -------------------------------- MFA -------------------------------- *
 * Same enroll/challenge/verify primitives the admin panel uses (see
 * src/lib/auth/mfa.server.ts and src/lib/admin/admin.functions.ts) — just
 * offered to any signed-in user instead of gated to platform admins, and
 * optional rather than mandatory (see unenrollMfaFn, which admin has no
 * equivalent of on purpose). */

export const getMfaStatusFn = createServerFn({ method: "GET" })
  .middleware(mfaLimit)
  .handler(async ({ context }) => getMfaStatus(context.tokens));

export const enrollMfaFn = createServerFn({ method: "POST" })
  .middleware(mfaLimit)
  .handler(async ({ context }) => enrollTotp(context.tokens));

const verifyEnrollSchema = z.object({
  factorId: z.string().min(1),
  code: z.string().trim().length(6),
});
export const verifyMfaEnrollmentFn = createServerFn({ method: "POST" })
  .middleware(mfaLimit)
  .inputValidator((data: unknown) => verifyEnrollSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { accessToken, refreshToken } = await verifyTotpEnrollment(
      context.tokens,
      data.factorId,
      data.code,
    );
    // The verify call upgrades the session to aal2 — reseal the cookie with
    // the new tokens now, or the next request would still read back aal1.
    await setServerSession({ accessToken, refreshToken });
    return { ok: true };
  });

const mfaChallengeSchema = z.object({ factorId: z.string().min(1) });
export const challengeMfaFn = createServerFn({ method: "POST" })
  .middleware(mfaLimit)
  .inputValidator((data: unknown) => mfaChallengeSchema.parse(data))
  .handler(async ({ data, context }) => challengeTotp(context.tokens, data.factorId));

const verifyMfaChallengeSchema = z.object({
  factorId: z.string().min(1),
  challengeId: z.string().min(1),
  code: z.string().trim().length(6),
});
export const verifyMfaChallengeFn = createServerFn({ method: "POST" })
  .middleware(mfaLimit)
  .inputValidator((data: unknown) => verifyMfaChallengeSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { accessToken, refreshToken } = await verifyTotpChallenge(
      context.tokens,
      data.factorId,
      data.challengeId,
      data.code,
    );
    await setServerSession({ accessToken, refreshToken });
    return { ok: true };
  });

const unenrollMfaSchema = z.object({ factorId: z.string().min(1) });
export const unenrollMfaFn = createServerFn({ method: "POST" })
  .middleware(mfaLimit)
  .inputValidator((data: unknown) => unenrollMfaSchema.parse(data))
  .handler(async ({ data, context }) => {
    await unenrollTotp(context.tokens, data.factorId);
    return { ok: true };
  });
