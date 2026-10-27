import type { Db } from "@/lib/business.server";
import { loadWorkspace } from "@/lib/business.server";
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

export type PostAuthPath = "/auth" | "/onboarding" | "/dashboard";

export async function resolvePostAuthPathForUser(
  accessToken: string,
  userId: string,
): Promise<"/onboarding" | "/dashboard"> {
  const supabase = createTokenScopedClient(accessToken);
  try {
    const workspace = await loadWorkspace(supabase as Db, userId);
    if (!workspace || !workspace.business.onboarding_completed) {
      return "/onboarding";
    }
    return "/dashboard";
  } catch (error) {
    // New merchants have no business row yet; a transient DB/RPC error should
    // still land them in shop setup, not back on the sign-in page.
    console.error("[auth] resolvePostAuthPathForUser", error);
    return "/onboarding";
  }
}

export async function resolvePostAuthPath(): Promise<PostAuthPath> {
  const ctx = await tryGetAuthedContext();
  if (!ctx) return "/auth";
  return resolvePostAuthPathForUser(ctx.tokens.accessToken, ctx.userId);
}
