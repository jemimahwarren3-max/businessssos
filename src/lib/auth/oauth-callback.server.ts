import { destinationAfterAuth, type PostAuthAppPath } from "@/lib/auth/post-auth-destination";
import { loadWorkspace, type Db } from "@/lib/business.server";
import {
  createAnonClient,
  createExchangeClient,
  createTokenScopedClient,
  setServerSession,
  tryGetAuthedContext,
  type SupabaseTokens,
} from "./session.server";

async function establishSession(session: { access_token: string; refresh_token: string }) {
  await setServerSession({
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
  });
}

/** Shared by OAuth server fn (never import this module from route files). */
async function sealSessionFromAuthSession(session: {
  access_token: string;
  refresh_token: string;
  user: { id: string };
}): Promise<{ userId: string; tokens: SupabaseTokens }> {
  const tokens: SupabaseTokens = {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
  };
  await establishSession(session);
  return { userId: session.user.id, tokens };
}

export async function completeOAuthCallback(input: { code: string }): Promise<{
  userId: string;
  tokens: SupabaseTokens;
}> {
  const { data: result, error } = await createExchangeClient().auth.exchangeCodeForSession(
    input.code,
  );
  if (!error && result.session) {
    return sealSessionFromAuthSession(result.session);
  }

  // Email confirm / recovery links after server-side mail often have no PKCE
  // verifier cookie — try Supabase OTP verify with the same `code` param.
  const anon = createAnonClient();
  for (const type of ["signup", "email", "recovery"] as const) {
    const { data: otp, error: otpError } = await anon.auth.verifyOtp({
      token_hash: input.code,
      type,
    });
    if (!otpError && otp.session) {
      return sealSessionFromAuthSession(otp.session);
    }
  }

  console.error("[auth] exchangeCodeForSession", error?.message ?? "no session");
  throw new Error("That sign-in link is invalid or has expired.");
}

export type PostAuthPath = "/auth" | PostAuthAppPath;

async function peekOnboardingCompleted(
  supabase: ReturnType<typeof createTokenScopedClient>,
  userId: string,
): Promise<boolean | null> {
  const { data: membership, error: memberError } = await supabase
    .from("business_members")
    .select("business_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (memberError) throw memberError;
  if (!membership) return null;

  const { data: business, error: bizError } = await supabase
    .from("businesses")
    .select("onboarding_completed")
    .eq("id", membership.business_id)
    .maybeSingle();
  if (bizError) throw bizError;
  if (!business) return null;
  return business.onboarding_completed;
}

export async function resolvePostAuthPathForUser(
  accessToken: string,
  userId: string,
): Promise<PostAuthAppPath> {
  const supabase = createTokenScopedClient(accessToken);
  let onboardingCompleted: boolean | null = null;
  try {
    const workspace = await loadWorkspace(supabase as Db, userId);
    onboardingCompleted = workspace ? workspace.business.onboarding_completed : null;
  } catch (error) {
    // A transient workspace RPC (feature flags, impersonation, limiter) must
    // not dump a returning merchant onto the onboarding error screen.
    console.error("[auth] resolvePostAuthPathForUser workspace", error);
    try {
      onboardingCompleted = await peekOnboardingCompleted(supabase, userId);
    } catch (fallbackError) {
      console.error("[auth] resolvePostAuthPathForUser membership", fallbackError);
    }
  }

  let isPlatformAdmin = false;
  if (onboardingCompleted === null) {
    try {
      const { isPlatformAdmin: checkAdmin } = await import("@/lib/admin/admin.server");
      isPlatformAdmin = await checkAdmin(userId);
    } catch (adminError) {
      console.error("[auth] resolvePostAuthPathForUser admin", adminError);
    }
  }

  return destinationAfterAuth({ onboardingCompleted, isPlatformAdmin });
}

export async function resolvePostAuthPath(): Promise<PostAuthPath> {
  const ctx = await tryGetAuthedContext();
  if (!ctx) return "/auth";
  return resolvePostAuthPathForUser(ctx.tokens.accessToken, ctx.userId);
}
