import type { Db } from "@/lib/business.server";
import { loadWorkspace } from "@/lib/business.server";
import { createExchangeClient, setServerSession, tryGetAuthedContext } from "./session.server";

async function establishSession(session: { access_token: string; refresh_token: string }) {
  await setServerSession({
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
  });
}

/** Shared by exchangeOAuthCode server fn (never import this module from route files). */
export async function completeOAuthCallback(input: { code: string }): Promise<{ userId: string }> {
  const { data: result, error } = await createExchangeClient().auth.exchangeCodeForSession(
    input.code,
  );
  if (error || !result.session) {
    throw new Error("That sign-in link is invalid or has expired.");
  }
  await establishSession(result.session);
  return { userId: result.user.id };
}

export type PostAuthPath = "/auth" | "/onboarding" | "/dashboard";

export async function resolvePostAuthPath(): Promise<PostAuthPath> {
  const ctx = await tryGetAuthedContext();
  if (!ctx) return "/auth";
  const workspace = await loadWorkspace(ctx.supabase as Db, ctx.userId);
  if (!workspace || !workspace.business.onboarding_completed) {
    return "/onboarding";
  }
  return "/dashboard";
}
