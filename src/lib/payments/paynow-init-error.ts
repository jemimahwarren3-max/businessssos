/** Safe merchant copy when Paynow rejects an initiate call. */

export const PAYNOW_INIT_FALLBACK =
  "Paynow couldn't start this payment. Please try again in a moment.";

const SAFE = /^[A-Za-z0-9 .,'()/:#+-]{8,180}$/;
const SECRET = /key|secret|token|password|integration[_ ]?(id|key)/i;
const NETWORK = /fetch|network|econn|etimedout|socket|enotfound/i;

export function userFacingPaynowInitError(
  response: { error?: string | null; success?: boolean } | null | undefined,
  thrown?: unknown,
): string {
  const thrownMessage = thrown instanceof Error ? thrown.message : "";
  for (const raw of [response?.error, thrownMessage]) {
    const cleaned =
      (raw ?? "")
        .replace(/^ERROR:\s*/i, "")
        .split("\n")[0]
        ?.trim() ?? "";
    if (!cleaned || SECRET.test(cleaned) || NETWORK.test(cleaned) || !SAFE.test(cleaned)) {
      continue;
    }
    return cleaned.endsWith(".") ? cleaned : `${cleaned}.`;
  }
  return PAYNOW_INIT_FALLBACK;
}
