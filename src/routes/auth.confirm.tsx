import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { useFinishPkceCode } from "@/lib/auth/use-finish-pkce-code";

const searchSchema = z.object({
  code: z.string().optional(),
  error: z.string().optional(),
  mode: z.string().optional().catch(undefined),
});

const FINISH_TIMEOUT_MS = 25_000;

export const Route = createFileRoute("/auth/confirm")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }],
  }),
  component: AuthConfirmFinish,
});

function AuthConfirmFinish() {
  const { code, error: oauthError } = Route.useSearch();
  const finishPkce = useFinishPkceCode();
  const started = useRef(false);
  const finished = useRef(false);
  const [failed, setFailed] = useState(Boolean(oauthError || !code));

  useEffect(() => {
    if (!code || oauthError || started.current) return;
    started.current = true;

    const timeout = window.setTimeout(() => {
      if (!finished.current) setFailed(true);
    }, FINISH_TIMEOUT_MS);

    void finishPkce({ code })
      .then(() => {
        finished.current = true;
      })
      .catch((err) => {
        console.error("[auth] confirm exchange failed", err);
        setFailed(true);
      })
      .finally(() => {
        window.clearTimeout(timeout);
      });
  }, [code, oauthError, finishPkce]);

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
          Open the link in the same browser you used to sign up (within 24 hours), or sign up again
          with email confirmation turned off on staging. If you still see this screen, check
          Supabase Auth logs for your project.
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
