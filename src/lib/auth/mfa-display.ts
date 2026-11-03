/** Normalise a TOTP secret for Authenticator (no spaces/newlines). */
export function totpSecretRaw(secret: string): string {
  return secret.replace(/\s+/g, "").toUpperCase();
}

/** Group a TOTP secret in 4s so the last character cannot wrap onto its own line. */
export function totpSecretGrouped(secret: string): string {
  const raw = totpSecretRaw(secret);
  return raw.match(/.{1,4}/g)?.join(" ") ?? raw;
}
