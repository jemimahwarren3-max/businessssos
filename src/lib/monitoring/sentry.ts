// Isomorphic Sentry — @sentry/node on the server, @sentry/react in the browser.
// No-op when the DSN for that runtime is unset (safe before Sentry exists).
//
// Production uses two Sentry projects: VITE_SENTRY_DSN (frontend) and
// VITE_SENTRY_DSN_BACKEND (server). DSNs are public, rate-limited keys.
const clientDsn = import.meta.env["VITE_SENTRY_DSN"] as string | undefined;
const serverDsn = import.meta.env["VITE_SENTRY_DSN_BACKEND"] as string | undefined;

let initialized = false;

function dsnForRuntime(): string | undefined {
  if (typeof window === "undefined") {
    return serverDsn || clientDsn;
  }
  return clientDsn;
}

async function sdk() {
  return typeof window === "undefined" ? import("@sentry/node") : import("@sentry/react");
}

export async function initSentry(): Promise<void> {
  const dsn = dsnForRuntime();
  if (!dsn || initialized) return;
  initialized = true;
  const Sentry = await sdk();
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0,
  });
}

export async function captureError(error: unknown): Promise<void> {
  const dsn = dsnForRuntime();
  if (!dsn) return;
  await initSentry();
  const Sentry = await sdk();
  Sentry.captureException(error);
}
