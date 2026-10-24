/** Supabase sometimes redirects to Site URL with tokens in the hash (not ?code=). */
export type AuthHashPayload = {
  accessToken: string;
  refreshToken: string;
  type: string | null;
};

export function parseAuthHash(hash: string): AuthHashPayload | null {
  if (!hash.startsWith("#")) return null;
  const params = new URLSearchParams(hash.slice(1));
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) return null;
  return {
    accessToken,
    refreshToken,
    type: params.get("type"),
  };
}

export function postAuthPathForLinkType(type: string | null): "/reset-password" | "/onboarding" {
  if (type === "recovery") return "/reset-password";
  return "/onboarding";
}
