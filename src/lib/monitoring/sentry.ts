// Isomorphic Sentry wiring — dynamically loads @sentry/node server-side or
// @sentry/react client-side, and is a complete no-op if VITE_SENTRY_DSN
// isn't set (so this is safe to ship inert before an account exists).
// Reading VITE_SENTRY_DSN on the server too is deliberate, not a mistake —
// Sentry DSNs are meant to be public (rate-limited per-project, the same
// value every Sentry "getting started" guide shows directly in client
// code), so there's no need for a second, server-only env var.
const dsn = import.meta.env["VITE_SENTRY_DSN"] as string | undefined;

let initialized = false;

async function sdk() {
  return typeof window === "undefined" ? import("@sentry/node") : import("@sentry/react");
}

export async function initSentry(): Promise<void> {
  if (!dsn || initialized) return;
  initialized = true;
  const Sentry = await sdk();
  Sentry.init({ dsn, environment: import.meta.env.MODE, tracesSampleRate: 0 });
}

export async function captureError(error: unknown): Promise<void> {
  if (!dsn) return;
  await initSentry();
  const Sentry = await sdk();
  Sentry.captureException(error);
}
