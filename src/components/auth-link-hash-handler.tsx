import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { establishSessionFromAuthTokens, verifyEmailLinkOtp } from "@/lib/auth/auth.functions";
import { navigateAfterAuth } from "@/lib/auth/post-auth-navigate";
import { parseAuthHash, postAuthPathForLinkType } from "@/lib/auth/parse-auth-hash";

/** Handles Auth email links that land on `/` (or any page) with `#access_token=…` or `?token_hash=`. */
export function AuthLinkHashHandler() {
  const ran = useRef(false);
  const sealTokens = useServerFn(establishSessionFromAuthTokens);
  const verifyOtp = useServerFn(verifyEmailLinkOtp);

  useEffect(() => {
    if (ran.current || typeof window === "undefined") return;
    const hashPayload = parseAuthHash(window.location.hash);
    const query = new URLSearchParams(window.location.search);
    const tokenHash = query.get("token_hash");
    const queryType = query.get("type");

    async function finish(path: "/reset-password" | "/onboarding") {
      ran.current = true;
      window.history.replaceState(null, "", window.location.pathname);
      navigateAfterAuth(path);
    }

    void (async () => {
      if (hashPayload) {
        try {
          await sealTokens({
            data: {
              accessToken: hashPayload.accessToken,
              refreshToken: hashPayload.refreshToken,
            },
          });
          await finish(postAuthPathForLinkType(hashPayload.type));
        } catch (error) {
          console.error("[auth] hash link session failed", error);
        }
        return;
      }

      if (tokenHash && queryType) {
        const otpType =
          queryType === "recovery" || queryType === "signup" || queryType === "email"
            ? queryType
            : null;
        if (!otpType) return;
        try {
          await verifyOtp({ data: { tokenHash, type: otpType } });
          await finish(otpType === "recovery" ? "/reset-password" : "/onboarding");
        } catch (error) {
          console.error("[auth] token_hash verify failed", error);
        }
      }
    })();
  }, [sealTokens, verifyOtp]);

  return null;
}
