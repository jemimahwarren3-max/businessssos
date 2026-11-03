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

const ADMIN_TOTP_NAME = "Admin authenticator";

export async function enrollTotp(tokens: SupabaseTokens) {
  const client = await createMfaScopedClient(tokens);
  const { data: factorsData } = await client.auth.mfa.listFactors();
  const leftovers = (factorsData?.all ?? []).filter(
    (factor) =>
      factor.factor_type === "totp" &&
      factor.status !== "verified" &&
      (factor.friendly_name === ADMIN_TOTP_NAME || !factor.friendly_name),
  );
  for (const factor of leftovers) {
    await client.auth.mfa.unenroll({ factorId: factor.id });
  }
  const { data, error } = await client.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: ADMIN_TOTP_NAME,
  });
  if (error || !data) throw new Error(error?.message ?? "Couldn't start MFA enrollment.");
  return { factorId: data.id, qrCode: totpQrSrc(data.totp.qr_code), secret: data.totp.secret };
}

/** Safe <img src> for Supabase's TOTP QR (raw SVG or an existing data URI). */
export function totpQrSrc(qrCode: string): string {
  const raw = qrCode.trim();
  if (!raw) return "";
  if (/^data:/i.test(raw)) return raw;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(raw)}`;
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
