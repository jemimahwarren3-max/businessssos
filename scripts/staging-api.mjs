/**
 * Shared Supabase Management API helpers, STAGING ONLY.
 * Production ref maidxfntfpnkcqnuhozo is rejected.
 */
export const STAGING_PROJECT_REF = "slajanbsfqjnuuiohbmg";
export const PRODUCTION_PROJECT_REF = "maidxfntfpnkcqnuhozo";

export function assertStagingRef(ref) {
  if (ref === PRODUCTION_PROJECT_REF) {
    throw new Error("Refusing to run against production.");
  }
  if (ref !== STAGING_PROJECT_REF) {
    throw new Error(`Refusing unknown project ref ${ref}. Expected ${STAGING_PROJECT_REF}.`);
  }
}

export function getStagingRef() {
  const ref = process.env.STAGING_SUPABASE_PROJECT_ID?.trim() || STAGING_PROJECT_REF;
  assertStagingRef(ref);
  return ref;
}

export function getAccessToken() {
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (!token) {
    return null;
  }
  return token;
}

/** Master/main must not skip staging SQL. PRs without a token still skip. */
export function requireStagingSqlEnabled(flag = process.env.REQUIRE_STAGING_SQL) {
  return ["1", "true", "yes"].includes(
    String(flag ?? "")
      .trim()
      .toLowerCase(),
  );
}

/**
 * @returns {"apply" | "skip" | "fail"}
 */
export function missingStagingTokenAction(token, requireFlag = process.env.REQUIRE_STAGING_SQL) {
  if (token) return "apply";
  return requireStagingSqlEnabled(requireFlag) ? "fail" : "skip";
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** @returns {Promise<Record<string, unknown>[]>} */
export async function runStagingSql(query, token = getAccessToken()) {
  if (!token) {
    throw new Error("SUPABASE_ACCESS_TOKEN is required.");
  }
  getStagingRef();
  const url = `https://api.supabase.com/v1/projects/${STAGING_PROJECT_REF}/database/query`;
  const body = JSON.stringify({ query });
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt > 0) {
      await sleepMs(2000 * 2 ** (attempt - 1));
    }
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body,
      });
    } catch (cause) {
      lastError = cause;
      continue;
    }
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`SQL ${res.status} (non-JSON): ${text.slice(0, 1500)}`);
    }
    if (res.ok) {
      return /** @type {Record<string, unknown>[]} */ (json);
    }
    const message =
      json && typeof json === "object" && "message" in json
        ? String(json.message)
        : text.slice(0, 1500);
  const retryable = res.status >= 500 || res.status === 429;
    lastError = new Error(`SQL ${res.status}: ${message}`);
    if (!retryable || attempt === 3) {
      throw lastError;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Staging SQL request failed.");
}
