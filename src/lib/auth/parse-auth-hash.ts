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

export type AuthEmailLinkSearch = {
  code?: string | undefined;
  token_hash?: string | undefined;
  token?: string | undefined;
  type?: string | undefined;
  error?: string | undefined;
};

export type AuthEmailLink = {
  error: string | undefined;
  code: string | undefined;
  tokenHash: string | undefined;
  type: string | undefined;
  hash: AuthHashPayload | null;
};

/** PKCE `?code=`, OTP `?token_hash=` / `?token=`, or implicit `#access_token=`. */
export function parseAuthEmailLink(search: AuthEmailLinkSearch, hash: string): AuthEmailLink {
  const tokenHash = search.token_hash?.trim() || search.token?.trim() || undefined;
  const code = search.code?.trim() || undefined;
  const type = search.type?.trim() || undefined;
  const error = search.error?.trim() || undefined;
  return {
    error,
    code,
    tokenHash,
    type,
    hash: parseAuthHash(hash),
  };
}

export function authEmailLinkHasCredential(link: AuthEmailLink): boolean {
  return Boolean(link.code || link.tokenHash || link.hash);
}

export function otpTypeFromLink(type: string | undefined): "recovery" | "signup" | "email" | null {
  if (type === "recovery" || type === "signup" || type === "email") return type;
  return null;
}
