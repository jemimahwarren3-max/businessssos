import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { LEGAL_VERSIONS } from "./legal-versions";

// Uses the service-role client deliberately, not the caller's own session —
// signUp() needs this to succeed even when email confirmation is required
// and no session exists yet. Best-effort: a transient failure here shouldn't
// block someone from creating an account, but it's logged since losing this
// record defeats its whole purpose.
export async function recordLegalAcceptance(userId: string, ipAddress: string | null) {
  const { error } = await supabaseAdmin.from("legal_acceptances").insert({
    user_id: userId,
    terms_version: LEGAL_VERSIONS.terms,
    privacy_version: LEGAL_VERSIONS.privacy,
    ip_address: ipAddress,
  });
  if (error) console.error("[businessos] failed to record legal acceptance", error);
}
