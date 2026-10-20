import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import {
  configuredPlatformRoot,
  publicStoreRedirect,
  shopHostsEnabled,
} from "./lib/storefront/host";
import { assertProductionRuntimeEnv } from "./lib/runtime-env.server";
import { initSentry } from "./lib/monitoring/sentry";
import { clientIpFromRequest } from "./lib/request-ip";

void initSentry();

let productionEnvChecked = false;
function ensureProductionRuntimeEnv() {
  if (productionEnvChecked) return;
  productionEnvChecked = true;
  assertProductionRuntimeEnv();
}

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

// Paynow's resulturl callback — a raw, unauthenticated x-www-form-urlencoded
// POST, not a TanStack `createServerFn` call, so it has to be handled here
// rather than as a route.
//
// Authenticity gate: Paynow doesn't send a signature header — it embeds a
// SHA512 hash directly in the POST body, computed against our
// PAYNOW_INTEGRATION_KEY (see node_modules/paynow's actual source; the
// README documents a different, nonexistent API). parseStatusUpdate() below
// verifies that hash and throws if it doesn't match, which is what proves
// this request genuinely came from Paynow — reject with 401 before doing
// any DB lookup if it fails.
//
// Even once authenticated, we still never trust the status field on the
// wire: always re-poll Paynow ourselves via our own stored poll_url before
// crediting anything. See src/lib/payments/paynow.server.ts for why.
async function verifyPlatformPaynowWebhookBody(raw: string): Promise<string | null> {
  const integrationId = process.env["PAYNOW_INTEGRATION_ID"];
  const integrationKey = process.env["PAYNOW_INTEGRATION_KEY"];
  if (!integrationId || !integrationKey) return null;

  const { Paynow } = await import("paynow");
  const paynow = new Paynow(integrationId, integrationKey);
  try {
    const status = paynow.parseStatusUpdate(raw);
    return status.reference ?? null;
  } catch (error) {
    console.error("[paynow webhook] platform hash verification failed", error);
    return null;
  }
}

async function handlePaynowWebhook(request: Request): Promise<Response> {
  try {
    const ip = clientIpFromRequest(request);
    const { supabaseAdmin } = await import("./integrations/supabase/client.server");
    const { data: allowed, error: rateError } = await supabaseAdmin.rpc("check_rate_limit", {
      _key: `paynow-webhook:ip:${ip}`,
      _limit: 30,
      _window_seconds: 60,
    });
    if (rateError || allowed !== true) {
      if (rateError) console.error("[paynow webhook] rate limit check failed", rateError);
      return new Response("Too Many Requests", { status: 429 });
    }

    const raw = await request.text();
    const { paynowReferenceFromBody, pollAndConfirmShopPayment } =
      await import("./lib/payments/shop-paynow.server");
    const reference = paynowReferenceFromBody(raw);
    if (!reference) return new Response("Unauthorized", { status: 401 });

    const shopPayment = await supabaseAdmin
      .from("shop_order_payments")
      .select("reference, poll_url, status, business_id")
      .eq("reference", reference)
      .maybeSingle();
    if (shopPayment.error) {
      console.error("[paynow webhook] shop lookup failed", shopPayment.error);
      return new Response("Error", { status: 500 });
    }
    if (shopPayment.data) {
      if (shopPayment.data.status === "created") {
        await pollAndConfirmShopPayment(
          shopPayment.data.reference,
          shopPayment.data.poll_url,
          shopPayment.data.business_id,
        );
      }
      return new Response("OK", { status: 200 });
    }

    const platformReference = await verifyPlatformPaynowWebhookBody(raw);
    if (!platformReference) return new Response("Unauthorized", { status: 401 });

    const { data: row, error } = await supabaseAdmin
      .from("subscription_payments")
      .select("reference, poll_url, status")
      .eq("reference", platformReference)
      .maybeSingle();
    if (error) {
      console.error("[paynow webhook] lookup failed", error);
      return new Response("Error", { status: 500 });
    }
    if (!row) return new Response("Unknown reference", { status: 404 });

    if (row.status === "created") {
      const { pollAndConfirmPayment } = await import("./lib/payments/paynow.server");
      await pollAndConfirmPayment(row.reference, row.poll_url);
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("[paynow webhook]", error);
    return new Response("Error", { status: 500 });
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    ensureProductionRuntimeEnv();
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/api/webhooks/paynow") {
      return handlePaynowWebhook(request);
    }

    const platform = configuredPlatformRoot();
    if (platform && (request.method === "GET" || request.method === "HEAD")) {
      const target = publicStoreRedirect(url, platform, shopHostsEnabled());
      if (target) return Response.redirect(target, 308);
    }

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
