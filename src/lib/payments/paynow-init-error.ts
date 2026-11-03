/** Safe merchant copy when Paynow rejects an initiate call. */

export const PAYNOW_INIT_FALLBACK =
  "Paynow couldn't start this payment. Please try again in a moment.";

export const PAYNOW_CREDENTIALS_REJECTED =
  "Paynow rejected these integration credentials. Use the Integration ID and Key from the same Paynow Ecommerce integration, save them as GitHub secrets, then redeploy.";

const SAFE = /^[A-Za-z0-9 .,'()/:#+-]{8,180}$/;
const SECRET = /key|secret|token|password|integration[_ ]?(id|key)/i;
const NETWORK = /fetch|network|econn|etimedout|socket|enotfound/i;
const CREDENTIAL =
  /hash(?:es)? do not match|invalid hash|invalid integration|invalid details|invalid credentials|unauthori[sz]e|invalid id|merchant not (?:found|active)|merchant is disabled/i;

function firstLine(value: string | null | undefined): string {
  return (
    (value ?? "")
      .replace(/^ERROR:\s*/i, "")
      .split("\n")[0]
      ?.trim() ?? ""
  );
}

export function userFacingPaynowInitError(
  response: { error?: string | null; success?: boolean } | null | undefined,
  thrown?: unknown,
): string {
  const thrownMessage = thrown instanceof Error ? thrown.message : "";
  for (const raw of [response?.error, thrownMessage]) {
    const cleaned = firstLine(raw);
    if (!cleaned) continue;
    if (CREDENTIAL.test(cleaned) || SECRET.test(cleaned)) {
      return PAYNOW_CREDENTIALS_REJECTED;
    }
    if (NETWORK.test(cleaned) || !SAFE.test(cleaned)) {
      continue;
    }
    return cleaned.endsWith(".") ? cleaned : `${cleaned}.`;
  }
  return PAYNOW_INIT_FALLBACK;
}
