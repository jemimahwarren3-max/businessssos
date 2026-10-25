import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { finishOAuthCallback } from "@/lib/auth/auth.functions";
import { navigateAfterAuth } from "@/lib/auth/post-auth-navigate";

const searchSchema = z.object({
  code: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

export const Route = createFileRoute("/auth/recover")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }],
  }),
  component: AuthRecoverFinish,
});

function AuthRecoverFinish() {
  const { code, error } = Route.useSearch();
  const finish = useServerFn(finishOAuthCallback);
  const started = useRef(false);
  const [failed, setFailed] = useState(Boolean(error || !code));

  useEffect(() => {
    if (!code || error || started.current) return;
    started.current = true;
    void finish({ data: { code } })
      .then(() => {
        navigateAfterAuth("/reset-password");
      })
      .catch((err) => {
        console.error("[auth] recover exchange failed", err);
        setFailed(true);
      });
  }, [code, error, finish]);

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
          Request a new password reset email and open the link in the same browser.
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
