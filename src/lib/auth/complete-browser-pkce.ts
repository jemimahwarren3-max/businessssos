import { supabase } from "@/integrations/supabase/client";

export type BrowserPkceExchangeResult =
  { ok: true; accessToken: string; refreshToken: string } | { ok: false; reason: string };

/** Uses the browser PKCE verifier cookie — required for email confirm links. */
export async function exchangePkceCodeInBrowser(code: string): Promise<BrowserPkceExchangeResult> {
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) {
    return {
      ok: false,
      reason: error?.message ?? "no session",
    };
  }
  return {
    ok: true,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  };
}
