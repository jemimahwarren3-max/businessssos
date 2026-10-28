import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { useFinishPkceCode } from "@/lib/auth/use-finish-pkce-code";

const searchSchema = z.object({
  code: z.string().optional(),
  next: z.enum(["/dashboard", "/onboarding", "/reset-password"]).optional().default("/dashboard"),
  error: z.string().optional(),
  acceptedTerms: z.literal("1").optional(),
});

const FINISH_TIMEOUT_MS = 25_000;

export const Route = createFileRoute("/auth_/callback")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }],
  }),
  component: AuthCallbackFinish,
});

function AuthCallbackFinish() {
  const { code, error, next, acceptedTerms } = Route.useSearch();
  const finishPkce = useFinishPkceCode();
  const started = useRef(false);
  const finished = useRef(false);
  const [failed, setFailed] = useState(Boolean(error || !code));

  useEffect(() => {
    if (!code || error || started.current) return;
    started.current = true;

    const timeout = window.setTimeout(() => {
      if (!finished.current) setFailed(true);
    }, FINISH_TIMEOUT_MS);

    const finishArgs =
      next === "/reset-password"
        ? {
            code,
            recordLegalAfterExchange: acceptedTerms === "1",
            successPath: "/reset-password" as const,
          }
        : { code, recordLegalAfterExchange: acceptedTerms === "1" };

    void finishPkce(finishArgs)
      .then(() => {
        finished.current = true;
      })
      .catch((err) => {
        console.error("[auth] callback exchange failed", err);
        setFailed(true);
      })
      .finally(() => {
        window.clearTimeout(timeout);
      });
  }, [code, error, next, acceptedTerms, finishPkce]);

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
        <h1 className="text-lg font-semibold">Google sign-in did not finish</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Try again in a private window, or use email sign-up. Confirm Supabase Site URL is{" "}
          <span className="font-medium">https://mykwetuu.com</span> (HTTPS).
        </p>
        <Link
          to="/auth"
          search={{ mode: "signin", reason: "oauth" }}
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Back to sign in
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
      <p className="text-sm text-muted-foreground">Finishing Google sign-in…</p>
    </div>
  );
}
