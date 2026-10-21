export type AuthProviderStatus = {
  email: boolean;
  google: boolean;
};

export const EMAIL_PROVIDER_OFF_MESSAGE = "Email sign-in is turned off. Continue with Google.";

export function parseAuthProviderStatus(data: unknown): AuthProviderStatus {
  const external =
    data && typeof data === "object" && "external" in data
      ? (data as { external?: { email?: unknown; google?: unknown } }).external
      : undefined;
  return {
    email: external?.email === true,
    google: external?.google === true,
  };
}

function supabasePublicEnv() {
  const url =
    import.meta.env["VITE_SUPABASE_URL"] ||
    process.env["SUPABASE_URL"] ||
    process.env["VITE_SUPABASE_URL"];
  const key =
    import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  return { url: String(url ?? "").replace(/\/$/, ""), key: String(key ?? "") };
}

/** Reads GoTrue's public settings. If the call fails, assume both are on so
 * the form still works when Email is actually enabled. */
export async function fetchAuthProviderStatus(): Promise<AuthProviderStatus> {
  const { url, key } = supabasePublicEnv();
  if (!url || !key) return { email: true, google: true };
  try {
    const res = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return { email: true, google: true };
    return parseAuthProviderStatus(await res.json());
  } catch {
    return { email: true, google: true };
  }
}
