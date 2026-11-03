import { getRequestIP } from "@tanstack/react-start/server";
import type { PostAuthAppPath } from "@/lib/auth/post-auth-destination";
import {
  completeOAuthCallback,
  resolvePostAuthPathForUser,
} from "@/lib/auth/oauth-callback.server";
import { recordLegalAcceptance } from "@/lib/legal-acceptance.server";

export type AuthCallbackResult = {
  path: PostAuthAppPath;
};

/** Exchange PKCE code and seal session in the current request (OAuth / email confirm). */
export async function handleAuthCallback(input: {
  code: string;
  acceptedTerms?: boolean;
}): Promise<AuthCallbackResult> {
  const { userId, tokens } = await completeOAuthCallback({ code: input.code });
  if (input.acceptedTerms) {
    try {
      await recordLegalAcceptance(userId, getRequestIP() ?? null);
    } catch (legalError) {
      console.error("[auth] legal acceptance after OAuth", legalError);
    }
  }
  const path = await resolvePostAuthPathForUser(tokens.accessToken, userId);
  return { path };
}
