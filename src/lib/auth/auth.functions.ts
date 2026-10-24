import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";
import { getAppUrl } from "@/lib/app-url.server";
import { deleteMyAccount } from "@/lib/account-deletion.server";
import type { Db } from "@/lib/business.server";
import { recordLegalAcceptance } from "@/lib/legal-acceptance.server";
import { allowAal1Session } from "@/integrations/supabase/auth-middleware";
import {
  authedRateLimit,
  clearLoginFailures,
  ipRateLimit,
  peekLoginFailures,
  recordLoginFailure,
} from "@/lib/rate-limit.server";
import { isPasswordBreached } from "./breach-check.server";
import { EMAIL_PROVIDER_OFF_MESSAGE } from "./auth-providers";
import { friendlySignUpError, isEmailProviderDisabled } from "./signup-errors";
import {
  challengeTotp,
  enrollTotp,
  getMfaStatus,
  unenrollTotp,
  verifyTotpChallenge,
  verifyTotpEnrollment,
} from "./mfa.server";
import { verifyCurrentPassword } from "./reauth.server";
import {
  completeOAuthCallback,
  resolvePostAuthPath,
  resolvePostAuthPathForUser,
} from "./oauth-callback.server";
import {
  clearServerSession,
  createAnonClient,
  createMfaScopedClient,
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
  allowAal1Session,
  authedRateLimit({ keyPrefix: "mfa", maxRequests: 8, windowSeconds: 60 }),
] as const;
const signOutOthersLimit = [
  authedRateLimit({ keyPrefix: "auth-signout-others", maxRequests: 5, windowSeconds: 60 }),
] as const;

const emailSchema = z.string().trim().toLowerCase().email();
const passwordSchema = z.string().min(8, "Use at least 8 characters.");

const signInSchema = z.object({ email: emailSchema, password: z.string().min(1) });
// Independent of signInLimit's per-IP cap above — this one follows the
// account across IPs, so spreading guesses across many source addresses
// doesn't help an attacker against a single targeted email.
const ACCOUNT_LOCKOUT_THRESHOLD = 5;
const ACCOUNT_LOCKOUT_WINDOW_SECONDS = 15 * 60;
const LOCKOUT_MESSAGE =
  "Too many failed sign-in attempts for this account. Please wait 15 minutes and try again, or reset your password.";
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
// Step-up re-authentication: re-checked right before a high-risk action
// (deleting the account, turning off MFA) so a hijacked session cookie alone
// isn't enough to perform it — the actor also has to know the password.
const stepUpSchema = z.object({
  currentPassword: z.string().min(1, "Enter your password to continue."),
});

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
    const lockoutKey = `auth-lockout:email:${data.email}`;
    const failures = await peekLoginFailures(lockoutKey, ACCOUNT_LOCKOUT_WINDOW_SECONDS);
    if (failures >= ACCOUNT_LOCKOUT_THRESHOLD) {
      throw new Error(LOCKOUT_MESSAGE);
    }

    const { data: result, error } = await createAnonClient().auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    // Deliberately the same message whether the email doesn't exist or the
    // password is wrong — distinguishing the two tells an attacker which
    // emails have accounts.
    if (error || !result.session) {
      const goTrue = `${error?.code ?? ""} ${error?.message ?? ""}`;
      if (isEmailProviderDisabled(goTrue)) {
        throw new Error(EMAIL_PROVIDER_OFF_MESSAGE);
      }
      await recordLoginFailure(lockoutKey, ACCOUNT_LOCKOUT_WINDOW_SECONDS);
      throw new Error("Incorrect email or password.");
    }
    await clearLoginFailures(lockoutKey);
    await establishSession(result.session);
    const path = await resolvePostAuthPathForUser(result.session.access_token, result.user.id);
    return { userId: result.user.id, path };
  });

const BREACHED_PASSWORD_MESSAGE =
  "That password has appeared in known data breaches, so it's not safe to use. Please choose a different one.";

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
      options: {
        data: { full_name: data.fullName },
        emailRedirectTo: `${getAppUrl()}/auth/callback?next=/onboarding`,
      },
    });
    if (error) {
      console.error("[auth] signUp", error.message, error.code ?? "");
      throw new Error(friendlySignUpError(`${error.code ?? ""} ${error.message}`));
    }

    if (result.user) {
      try {
        await recordLegalAcceptance(result.user.id, getRequestIP() ?? null);
      } catch (legalError) {
        console.error("[auth] legal acceptance after signUp", legalError);
      }
    }

    if (result.session) {
      await establishSession(result.session);
      const path = await resolvePostAuthPathForUser(result.session.access_token, result.user!.id);
      return { needsEmailConfirmation: false, path };
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

const resendConfirmationSchema = z.object({ email: emailSchema });

/** Resend Supabase Auth signup confirmation (not Resend transactional mail). */
export const resendSignupConfirmation = createServerFn({ method: "POST" })
  .middleware(resetLimit)
  .inputValidator((data: unknown) => resendConfirmationSchema.parse(data))
  .handler(async ({ data }) => {
    const { error } = await createAnonClient().auth.resend({
      type: "signup",
      email: data.email,
      options: {
        emailRedirectTo: `${getAppUrl()}/auth/callback?next=/onboarding`,
      },
    });
    if (error) {
      throw new Error(friendlySignUpError(`${error.code ?? ""} ${error.message}`));
    }
    return { ok: true as const };
  });

// Called from routes/auth.callback.tsx's beforeLoad — the server-side half
// of the PKCE OAuth/magic-link handoff. The browser holds the code_verifier
// (see integrations/supabase/client.ts's cookie-backed storage adapter);
// Supabase's SDK reads it back out of that same cookie via this request.
const oauthCallbackSchema = z.object({
  code: z.string().min(1),
  acceptedTerms: z.boolean().optional(),
});

/** Single round-trip: exchange PKCE code, seal session, return onboarding vs dashboard. */
export const finishOAuthCallback = createServerFn({ method: "POST" })
  .middleware(oauthCallbackLimit)
  .inputValidator((data: unknown) => oauthCallbackSchema.parse(data))
  .handler(async ({ data }) => {
    const { userId, tokens } = await completeOAuthCallback({ code: data.code });
    if (data.acceptedTerms) {
      await recordLegalAcceptance(userId, getRequestIP() ?? null);
    }
    const path = await resolvePostAuthPathForUser(tokens.accessToken, userId);
    return { path };
  });

/** @deprecated Prefer finishOAuthCallback — kept for tests calling exchange only. */
export const exchangeOAuthCode = createServerFn({ method: "POST" })
  .middleware(oauthCallbackLimit)
  .inputValidator((data: unknown) => oauthCallbackSchema.parse(data))
  .handler(async ({ data }) => {
    const { userId } = await completeOAuthCallback({ code: data.code });
    if (data.acceptedTerms) {
      await recordLegalAcceptance(userId, getRequestIP() ?? null);
    }
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
    // ctx.supabase only ever carries the access token as a bearer header —
    // signOut() needs a client that's actually been through auth.setSession()
    // to know which refresh token to revoke (same requirement as the MFA
    // client below); without it, signOut() reports success but the refresh
    // token silently stays valid. Confirmed live: a bearer-only client's
    // signOut() left the old refresh token usable indefinitely.
    const client = await createMfaScopedClient(ctx.tokens);
    await client.auth.signOut();
  }
  await clearServerSession();
  return { ok: true };
});

export const signOutOtherDevicesFn = createServerFn({ method: "POST" })
  .middleware(signOutOthersLimit)
  .handler(async ({ context }) => {
    const client = await createMfaScopedClient(context.tokens);
    const { error } = await client.auth.signOut({ scope: "others" });
    if (error) throw new Error("Couldn't sign out other devices. Please try again.");
    return { ok: true };
  });

export const getCurrentUser = createServerFn({ method: "GET" }).handler(async () => {
  const ctx = await tryGetAuthedContext();
  if (!ctx) return null;
  const email = (ctx.claims as { email?: string }).email ?? null;
  return { userId: ctx.userId, email };
});

/** After OAuth or magic link — send new merchants to shop setup, not an empty dashboard. */
export const getPostAuthDestination = createServerFn({ method: "GET" }).handler(async () => {
  const path = await resolvePostAuthPath();
  return { path };
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
  .inputValidator((data: unknown) => stepUpSchema.parse(data))
  .handler(async ({ data, context }) => {
    const email = (context.claims as { email?: string }).email;
    if (!email || !(await verifyCurrentPassword(email, data.currentPassword))) {
      throw new Error("Incorrect password.");
    }
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

const unenrollMfaSchema = z.object({
  factorId: z.string().min(1),
  currentPassword: z.string().min(1, "Enter your password to continue."),
});
export const unenrollMfaFn = createServerFn({ method: "POST" })
  .middleware(mfaLimit)
  .inputValidator((data: unknown) => unenrollMfaSchema.parse(data))
  .handler(async ({ data, context }) => {
    const email = (context.claims as { email?: string }).email;
    if (!email || !(await verifyCurrentPassword(email, data.currentPassword))) {
      throw new Error("Incorrect password.");
    }
    await unenrollTotp(context.tokens, data.factorId);
    return { ok: true };
  });
