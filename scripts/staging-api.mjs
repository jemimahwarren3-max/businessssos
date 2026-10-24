/**
 * Shared Supabase Management API helpers — STAGING ONLY.
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

/** @returns {Promise<Record<string, unknown>[]>} */
export async function runStagingSql(query, token = getAccessToken()) {
  if (!token) {
    throw new Error("SUPABASE_ACCESS_TOKEN is required.");
  }
  getStagingRef();
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${STAGING_PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    },
  );
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`SQL ${res.status} (non-JSON): ${text.slice(0, 1500)}`);
  }
  if (!res.ok) {
    const message =
      json && typeof json === "object" && "message" in json
        ? String(json.message)
        : text.slice(0, 1500);
    throw new Error(`SQL ${res.status}: ${message}`);
  }
  return /** @type {Record<string, unknown>[]} */ (json);
}
