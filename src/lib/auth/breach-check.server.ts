const TIMEOUT_MS = 3000;

async function sha1Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/** Checks a password against HaveIBeenPwned's Pwned Passwords range API.
 * K-anonymity: only the first 5 hex characters of the SHA-1 hash ever leave
 * this server — never the password, never the full hash — so HIBP itself
 * has no way to learn what password was checked.
 *
 * Fails OPEN on purpose: if HIBP is slow, down, or unreachable, this
 * returns false (not breached) rather than blocking signup or a password
 * change on a third-party outage — same resilience stance as the Redis
 * cache (see cache/redis.server.ts's own "a cache outage must never become
 * an application outage"). A 3s timeout keeps a hung request from ever
 * being the reason a signup stalls. */
export async function isPasswordBreached(password: string): Promise<boolean> {
  try {
    const hash = await sha1Hex(password);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        signal: controller.signal,
        // Padded with decoy suffixes so response size can't be used to
        // infer whether a hit occurred — see HIBP's own docs on this header.
        headers: { "Add-Padding": "true" },
      });
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) return false;

    const body = await response.text();
    for (const line of body.split("\n")) {
      const candidateSuffix = line.split(":")[0]?.trim();
      if (candidateSuffix === suffix) return true;
    }
    return false;
  } catch (error) {
    console.error("[businessos] breach check failed, failing open", error);
    return false;
  }
}
