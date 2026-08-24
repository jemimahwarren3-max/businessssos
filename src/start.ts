import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// script-src/style-src keep 'unsafe-inline' deliberately: TanStack Start's
// SSR hydration payload and Radix UI's inline positioning styles both rely
// on inline <script>/style, and there's no browser available in this
// environment to verify a nonce-based CSP wouldn't just blank-page the app.
// Tightening this further needs real browser verification, not a guess.
function buildCsp(): string {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : "https://*.supabase.co";
  const supabaseWs = supabaseOrigin.replace(/^http/, "ws");
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    `connect-src 'self' ${supabaseOrigin} ${supabaseWs}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

const CSP = buildCsp();

// Applies to every response (pages and server-fn calls alike) — cheap
// insurance against clickjacking, MIME-sniffing, and third-party embedding,
// on top of (not instead of) the app-layer auth/RLS boundaries.
const securityHeadersMiddleware = createMiddleware().server(async ({ next }) => {
  const result = await next();
  if (result && typeof result === "object" && "response" in result && result.response) {
    const headers = result.response.headers;
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Frame-Options", "DENY");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
    headers.set("Content-Security-Policy", CSP);
  }
  return result;
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests. This matters even more now that auth is a
// cookie the browser attaches automatically (see lib/auth/session.server.ts)
// rather than a token client code had to deliberately attach — without this,
// a cookie-based session would be CSRF-exposed.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware, securityHeadersMiddleware, csrfMiddleware],
}));
