import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { finishOAuthCallback } from "@/lib/auth/auth.functions";

const searchSchema = z.object({
  code: z.string().optional(),
  error: z.string().optional(),
});

export const Route = createFileRoute("/auth/confirm")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }],
  }),
  beforeLoad: async ({ search }) => {
    if (!search.code || search.error) {
      throw redirect({ to: "/auth", search: { mode: "signup" } });
    }
    let path: "/onboarding" | "/dashboard";
    try {
      ({ path } = await finishOAuthCallback({ data: { code: search.code } }));
    } catch (error) {
      console.error("[auth] confirm exchange failed", error);
      throw redirect({ to: "/auth", search: { mode: "signup" } });
    }
    throw redirect({ to: path, replace: true });
  },
  component: AuthConfirmPending,
});

function AuthConfirmPending() {
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
