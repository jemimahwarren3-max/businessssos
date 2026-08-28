import { createMfaScopedClient, type SupabaseTokens } from "./session.server";

export type MfaStatus = {
  enrolled: boolean;
  currentLevel: "aal1" | "aal2";
  factorId: string | null;
};

/** The authoritative AAL check — goes through Supabase's own
 * getAuthenticatorAssuranceLevel() rather than reading a raw JWT claim, so
 * it can't drift from whatever Supabase's SDK actually considers current. */
export async function getMfaStatus(tokens: SupabaseTokens): Promise<MfaStatus> {
  const client = await createMfaScopedClient(tokens);
  const { data: factorsData } = await client.auth.mfa.listFactors();
  const totpFactor = factorsData?.totp?.find((f) => f.status === "verified") ?? null;

  const { data: aalData, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !aalData) {
    return {
      enrolled: Boolean(totpFactor),
      currentLevel: "aal1",
      factorId: totpFactor?.id ?? null,
    };
  }
  return {
    enrolled: Boolean(totpFactor),
    currentLevel: aalData.currentLevel === "aal2" ? "aal2" : "aal1",
    factorId: totpFactor?.id ?? null,
  };
}

export async function enrollTotp(tokens: SupabaseTokens) {
  const client = await createMfaScopedClient(tokens);
  const { data, error } = await client.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Admin authenticator",
  });
  if (error || !data) throw new Error(error?.message ?? "Couldn't start MFA enrollment.");
  // Returned as a data: URI for an <img> tag rather than raw SVG markup —
  // an <img src="data:image/svg+xml..."> never executes embedded scripts,
  // unlike injecting the SVG into the DOM directly would.
  const qrCodeDataUri = `data:image/svg+xml;base64,${Buffer.from(data.totp.qr_code).toString("base64")}`;
  return { factorId: data.id, qrCode: qrCodeDataUri, secret: data.totp.secret };
}

/** Confirms a freshly-enrolled factor by verifying one code — Supabase
 * treats enroll+verify as a single challenge/verify pair (no separate
 * "challenge" step during initial enrollment, unlike a returning sign-in). */
export async function verifyTotpEnrollment(tokens: SupabaseTokens, factorId: string, code: string) {
  const client = await createMfaScopedClient(tokens);
  const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({ factorId });
  if (challengeError || !challenge) {
    throw new Error(challengeError?.message ?? "Couldn't start MFA verification.");
  }
  const { data, error } = await client.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  });
  if (error || !data) throw new Error(error?.message ?? "That code didn't work. Try again.");
  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}

/** Same challenge/verify pair, for a returning admin whose current session
 * is still aal1 (a fresh sign-in, or an already-enrolled factor that just
 * hasn't been verified yet this session). */
/** Unlike the admin panel (MFA mandatory, no way off), a business user who
 * enrolled voluntarily can turn it back off — e.g. after losing their
 * authenticator device. Requires the caller to already be aal2 (Supabase
 * enforces this itself), so turning MFA off still needs a valid code from
 * the outgoing factor first. */
export async function unenrollTotp(tokens: SupabaseTokens, factorId: string) {
  const client = await createMfaScopedClient(tokens);
  const { error } = await client.auth.mfa.unenroll({ factorId });
  if (error) throw new Error(error.message || "Couldn't turn off MFA. Please try again.");
}

export async function challengeTotp(tokens: SupabaseTokens, factorId: string) {
  const client = await createMfaScopedClient(tokens);
  const { data, error } = await client.auth.mfa.challenge({ factorId });
  if (error || !data) throw new Error(error?.message ?? "Couldn't start MFA verification.");
  return { challengeId: data.id };
}

export async function verifyTotpChallenge(
  tokens: SupabaseTokens,
  factorId: string,
  challengeId: string,
  code: string,
) {
  const client = await createMfaScopedClient(tokens);
  const { data, error } = await client.auth.mfa.verify({ factorId, challengeId, code });
  if (error || !data) throw new Error(error?.message ?? "That code didn't work. Try again.");
  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}
