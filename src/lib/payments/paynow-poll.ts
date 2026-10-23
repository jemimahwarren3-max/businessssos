const MAX_PAYNOW_RESPONSE_BYTES = 16_384;
const PAYNOW_POLL_HOST = "www.paynow.co.zw";

export function isPaynowPollUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname.toLowerCase() === PAYNOW_POLL_HOST &&
      (url.port === "" || url.port === "443") &&
      url.username === "" &&
      url.password === "" &&
      url.pathname.toLowerCase() === "/interface/checkpayment/"
    );
  } catch {
    return false;
  }
}

export async function fetchPaynowPollResponse(pollUrl: string): Promise<string> {
  if (!isPaynowPollUrl(pollUrl)) {
    throw new Error("Paynow returned an invalid transaction-status URL.");
  }

  const response = await fetch(pollUrl, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Paynow status check returned HTTP ${response.status}.`);
  }

  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_PAYNOW_RESPONSE_BYTES) {
    throw new Error("Paynow status response is too large.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Paynow returned an empty status response.");
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_PAYNOW_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("Paynow status response is too large.");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

export function amountToMinorUnits(value: string | number): bigint | null {
  const amount = String(value).trim();
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(amount);
  if (!match) return null;
  const whole = match[1];
  if (whole === undefined) return null;
  const fraction = (match[2] ?? "").padEnd(2, "0");
  return BigInt(whole) * 100n + BigInt(fraction);
}
