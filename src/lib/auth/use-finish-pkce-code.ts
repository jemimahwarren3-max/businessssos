import { useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  establishSessionFromAuthTokens,
  finishOAuthCallback,
  getPostAuthDestination,
  recordSignupLegalAcceptance,
  getCurrentUser,
} from "@/lib/auth/auth.functions";
import { exchangePkceCodeInBrowser } from "@/lib/auth/complete-browser-pkce";
import { navigateAfterAuth } from "@/lib/auth/post-auth-navigate";

type FinishOptions = {
  code: string;
  /** Fixed path after success (e.g. password reset). When omitted, uses onboarding vs dashboard. */
  successPath?: string;
  recordLegalAfterExchange?: boolean;
};

/**
 * Finish a Supabase PKCE `?code=` link: exchange in the browser first (verifier cookie),
 * seal the httpOnly session on the server, then full-page navigate.
 */
export function useFinishPkceCode() {
  const sealSession = useServerFn(establishSessionFromAuthTokens);
  const finishOnServer = useServerFn(finishOAuthCallback);
  const fetchDestination = useServerFn(getPostAuthDestination);
  const fetchUser = useServerFn(getCurrentUser);
  const recordLegal = useServerFn(recordSignupLegalAcceptance);

  return useCallback(
    async ({ code, successPath, recordLegalAfterExchange }: FinishOptions): Promise<void> => {
      const browser = await exchangePkceCodeInBrowser(code);
      if (browser.ok) {
        await sealSession({
          data: {
            accessToken: browser.accessToken,
            refreshToken: browser.refreshToken,
          },
        });
        if (recordLegalAfterExchange) {
          const user = await fetchUser();
          if (user) {
            await recordLegal({
              data: { userId: user.userId, acceptedTerms: true },
            });
          }
        }
        if (successPath) {
          navigateAfterAuth(successPath);
          return;
        }
        const destination = await fetchDestination();
        const path = destination.path === "/auth" ? "/onboarding" : destination.path;
        navigateAfterAuth(path);
        return;
      }

      const { path } = await finishOnServer({
        data: {
          code,
          ...(recordLegalAfterExchange ? { acceptedTerms: true } : {}),
        },
      });
      navigateAfterAuth(successPath ?? path);
    },
    [sealSession, finishOnServer, fetchDestination, fetchUser, recordLegal],
  );
}
