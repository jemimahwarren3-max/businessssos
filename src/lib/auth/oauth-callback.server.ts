import type { Db } from "@/lib/business.server";
import { loadWorkspace } from "@/lib/business.server";
import {
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
export async function completeOAuthCallback(input: { code: string }): Promise<{
  userId: string;
  tokens: SupabaseTokens;
}> {
  const { data: result, error } = await createExchangeClient().auth.exchangeCodeForSession(
    input.code,
  );
  if (error || !result.session) {
    throw new Error("That sign-in link is invalid or has expired.");
  }
  const tokens: SupabaseTokens = {
    accessToken: result.session.access_token,
    refreshToken: result.session.refresh_token,
  };
  await establishSession(result.session);
  return { userId: result.user.id, tokens };
}

export type PostAuthPath = "/auth" | "/onboarding" | "/dashboard";

export async function resolvePostAuthPathForUser(
  accessToken: string,
  userId: string,
): Promise<"/onboarding" | "/dashboard"> {
  const supabase = createTokenScopedClient(accessToken);
  const workspace = await loadWorkspace(supabase as Db, userId);
  if (!workspace || !workspace.business.onboarding_completed) {
    return "/onboarding";
  }
  return "/dashboard";
}

export async function resolvePostAuthPath(): Promise<PostAuthPath> {
  const ctx = await tryGetAuthedContext();
  if (!ctx) return "/auth";
  return resolvePostAuthPathForUser(ctx.tokens.accessToken, ctx.userId);
}
