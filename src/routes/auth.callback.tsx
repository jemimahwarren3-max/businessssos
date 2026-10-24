import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { finishOAuthCallback } from "@/lib/auth/auth.functions";

const searchSchema = z.object({
  code: z.string().optional(),
  next: z.enum(["/dashboard", "/onboarding", "/reset-password"]).optional().default("/dashboard"),
  error: z.string().optional(),
  acceptedTerms: z.literal("1").optional(),
});

export const Route = createFileRoute("/auth/callback")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }],
  }),
  beforeLoad: async ({ search }) => {
    if (!search.code || search.error) {
      throw redirect({ to: "/auth", search: { mode: "signin" } });
    }

    let path: "/onboarding" | "/dashboard";
    try {
      ({ path } = await finishOAuthCallback({
        data: { code: search.code, acceptedTerms: search.acceptedTerms === "1" },
      }));
    } catch {
      throw redirect({ to: "/auth", search: { mode: "signin", reason: "oauth" } });
    }

    if (search.next === "/reset-password") {
      throw redirect({ to: "/reset-password", replace: true });
    }

    throw redirect({ to: path, replace: true });
  },
  component: () => null,
});
