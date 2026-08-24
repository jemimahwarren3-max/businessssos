import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { exchangeOAuthCode } from "@/lib/auth/auth.functions";

// Where Google's OAuth redirect and Supabase's magic-link/recovery emails
// land — the server-side half of the PKCE handoff (see auth.functions.ts's
// exchangeOAuthCode and client.ts's cookie-backed code_verifier storage).
// This route has to run server-side (no ssr:false here, unlike the
// _authenticated group) since only the server can read the httpOnly session
// cookie it writes.
const searchSchema = z.object({
  code: z.string().optional(),
  next: z.enum(["/dashboard", "/reset-password"]).optional().default("/dashboard"),
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

    try {
      await exchangeOAuthCode({
        data: { code: search.code, acceptedTerms: search.acceptedTerms === "1" },
      });
    } catch {
      throw redirect({ to: "/auth", search: { mode: "signin" } });
    }

    throw redirect({
      to: search.next === "/reset-password" ? "/reset-password" : "/dashboard",
      replace: true,
    });
  },
  component: () => null,
});
