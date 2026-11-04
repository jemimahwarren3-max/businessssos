import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { establishSessionFromAuthTokens, verifyEmailLinkOtp } from "@/lib/auth/auth.functions";
import {
  authEmailLinkHasCredential,
  otpTypeFromLink,
  parseAuthEmailLink,
} from "@/lib/auth/parse-auth-hash";
import { navigateAfterAuth } from "@/lib/auth/post-auth-navigate";
import { useFinishPkceCode } from "@/lib/auth/use-finish-pkce-code";

const searchSchema = z.object({
  code: z.string().optional(),
  token_hash: z.string().optional(),
  token: z.string().optional(),
  type: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

const FINISH_TIMEOUT_MS = 25_000;

export const Route = createFileRoute("/auth_/recover")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }],
  }),
  component: AuthRecoverFinish,
});

function AuthRecoverFinish() {
  const search = Route.useSearch();
  const finishPkce = useFinishPkceCode();
  const sealTokens = useServerFn(establishSessionFromAuthTokens);
  const verifyOtp = useServerFn(verifyEmailLinkOtp);
  const started = useRef(false);
  const finished = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const timeout = window.setTimeout(() => {
      if (!finished.current) setFailed(true);
    }, FINISH_TIMEOUT_MS);

    void (async () => {
      const link = parseAuthEmailLink(search, window.location.hash);
      try {
        if (link.error && !authEmailLinkHasCredential(link)) {
          setFailed(true);
          return;
        }

        if (link.hash) {
          await sealTokens({
            data: {
              accessToken: link.hash.accessToken,
              refreshToken: link.hash.refreshToken,
            },
          });
          finished.current = true;
          navigateAfterAuth("/reset-password");
          return;
        }

        if (link.tokenHash) {
          await verifyOtp({
            data: {
              tokenHash: link.tokenHash,
              type: otpTypeFromLink(link.type) ?? "recovery",
            },
          });
          finished.current = true;
          navigateAfterAuth("/reset-password");
          return;
        }

        if (link.code) {
          await finishPkce({ code: link.code, successPath: "/reset-password" });
          finished.current = true;
          return;
        }

        setFailed(true);
      } catch (err) {
        console.error("[auth] recover exchange failed", err);
        setFailed(true);
      } finally {
        window.clearTimeout(timeout);
      }
    })();
  }, [search, finishPkce, sealTokens, verifyOtp]);

  if (failed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <img
          src="/kwetuu-logo.png"
          alt=""
          className="h-12 w-auto opacity-90"
          width={192}
          height={96}
        />
        <h1 className="text-lg font-semibold">Reset link did not work</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Request a new password reset on this device, then open the email link in the same browser
          within 24 hours. Do not open it from another phone or the Gmail app preview.
        </p>
        <Link
          to="/auth"
          search={{ mode: "reset" }}
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Request reset
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <img
        src="/kwetuu-logo.png"
        alt=""
        className="h-12 w-auto opacity-90"
        width={192}
        height={96}
      />
      <p className="text-sm text-muted-foreground">Opening password reset…</p>
    </div>
  );
}
