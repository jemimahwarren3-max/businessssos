import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { finishOAuthCallback } from "@/lib/auth/auth.functions";
import { navigateAfterAuth } from "@/lib/auth/post-auth-navigate";

const searchSchema = z.object({
  code: z.string().optional(),
  error: z.string().optional(),
  mode: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/auth/confirm")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }],
  }),
  component: AuthConfirmFinish,
});

function AuthConfirmFinish() {
  const { code, error: oauthError } = Route.useSearch();
  const finish = useServerFn(finishOAuthCallback);
  const started = useRef(false);
  const [failed, setFailed] = useState(Boolean(oauthError || !code));

  useEffect(() => {
    if (!code || oauthError || started.current) return;
    started.current = true;
    void finish({ data: { code } })
      .then(({ path }) => {
        navigateAfterAuth(path);
      })
      .catch((err) => {
        console.error("[auth] confirm exchange failed", err);
        setFailed(true);
      });
  }, [code, oauthError, finish]);

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
        <h1 className="text-lg font-semibold">Confirmation link did not work</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          The link may have expired, or you opened it in a different browser than the one you signed
          up with. Request a new confirmation email and open it in the same browser.
        </p>
        <Link
          to="/auth"
          search={{ mode: "signup" }}
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Back to sign up
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
      <p className="text-sm text-muted-foreground">Confirming your email…</p>
    </div>
  );
}
