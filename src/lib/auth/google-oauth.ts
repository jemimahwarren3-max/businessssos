export const GOOGLE_OAUTH_NEXT = ["/onboarding", "/dashboard"] as const;
export type GoogleOAuthNext = (typeof GOOGLE_OAUTH_NEXT)[number];

export function googleOAuthRedirectTo(
  origin: string,
  opts: { next: GoogleOAuthNext; acceptedTerms?: boolean },
): string {
  const base = origin.replace(/\/+$/, "");
  const url = new URL("/auth/callback", `${base}/`);
  url.searchParams.set("next", opts.next);
  if (opts.acceptedTerms) url.searchParams.set("acceptedTerms", "1");
  return url.toString();
}
