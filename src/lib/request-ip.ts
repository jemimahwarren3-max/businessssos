const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^[0-9a-f:]+$/i;

function looksLikeIp(value: string): boolean {
  if (!value || value.length > 45) return false;
  if (IPV4.test(value)) {
    return value.split(".").every((octet) => {
      const n = Number(octet);
      return n >= 0 && n <= 255;
    });
  }
  return IPV6.test(value) && value.includes(":");
}

/** First hop only — later X-Forwarded-For entries are easy to spoof. */
export function clientIpFromForwarded(
  forwardedFor: string | null | undefined,
  realIp: string | null | undefined = null,
): string {
  const first = forwardedFor?.split(",")[0]?.trim() ?? "";
  if (looksLikeIp(first)) return first;
  const fallback = realIp?.trim() ?? "";
  if (looksLikeIp(fallback)) return fallback;
  return "unknown";
}

export function clientIpFromRequest(request: Request): string {
  return clientIpFromForwarded(
    request.headers.get("x-forwarded-for"),
    request.headers.get("x-real-ip"),
  );
}
