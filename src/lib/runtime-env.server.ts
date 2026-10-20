const REQUIRED_PRODUCTION = [
  "APP_URL",
  "SESSION_SECRET",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

/** Fail the process at boot if a production container is missing the
 * variables every request needs. Optional keys (Paynow, Groq, Resend,
 * Redis, Sentry) stay optional so a first Cloud Run revision can serve
 * POS and path-based shops without them. */
export function assertProductionRuntimeEnv(
  env: NodeJS.ProcessEnv = process.env,
  nodeEnv = env["NODE_ENV"],
): string[] {
  if (nodeEnv !== "production") return [];
  const missing = REQUIRED_PRODUCTION.filter((key) => !env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Missing required production environment variables: ${missing.join(", ")}. Set them on the Cloud Run service.`,
    );
  }
  const sessionSecret = env["SESSION_SECRET"]?.trim() ?? "";
  if (sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters in production.");
  }
  return missing;
}
