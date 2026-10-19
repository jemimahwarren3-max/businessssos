import { Paynow, type InitResponse } from "paynow";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AppError, dbFail, type Db } from "@/lib/business.server";
import { openPaynowSecrets, sealPaynowSecrets } from "./paynow-seal";

function getAppUrl(): string {
  const url = process.env["APP_URL"];
  if (!url) {
    throw new AppError("Payments aren't configured yet (missing APP_URL).");
  }
  return url.replace(/\/+$/, "");
}

/** Merchant checkout only. Never reads PAYNOW_INTEGRATION_* platform keys. */
async function merchantPaynow(businessId: string, returnPath: string): Promise<Paynow> {
  const { data, error } = await supabaseAdmin
    .from("store_paynow_credentials")
    .select("ciphertext")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) dbFail("load shop Paynow credentials", error);
  if (!data?.ciphertext) {
    throw new AppError("This shop has not linked a Paynow account yet.");
  }
  const secrets = openPaynowSecrets(data.ciphertext);
  const appUrl = getAppUrl();
  return new Paynow(
    secrets.integrationId,
    secrets.integrationKey,
    `${appUrl}/api/webhooks/paynow`,
    `${appUrl}${returnPath}`,
  );
}

export async function saveShopPaynowCredentials(
  supabase: Db,
  businessId: string,
  integrationId: string,
  integrationKey: string,
): Promise<{ connected: true }> {
  const id = integrationId.trim();
  const key = integrationKey.trim();
  if (id.length < 4 || key.length < 8) {
    throw new AppError(
      "Enter the Paynow integration ID and key from that shop's Paynow dashboard.",
    );
  }
  const ciphertext = sealPaynowSecrets({ integrationId: id, integrationKey: key });
  void supabase;
  const { error } = await supabaseAdmin.from("store_paynow_credentials").upsert({
    business_id: businessId,
    ciphertext,
    updated_at: new Date().toISOString(),
  });
  if (error) dbFail("save shop Paynow credentials", error);
  return { connected: true };
}

export async function shopPaynowConnected(businessId: string): Promise<boolean> {
  const result = await supabaseAdmin
    .from("store_paynow_credentials")
    .select("business_id")
    .eq("business_id", businessId)
    .maybeSingle();
  if (result.error) dbFail("shop Paynow connected", result.error);
  return Boolean(result.data);
}

export async function initiateShopPaynow(input: {
  slug: string;
  orderId: string;
  reference: string;
  email: string;
  phone?: string;
  channel: "web" | "ecocash";
  amount: number;
  currency: string;
}): Promise<{ redirectUrl?: string; instructions?: string; paynowReference: string }> {
  if (input.channel === "ecocash" && (input.phone ?? "").replace(/\D/g, "").length < 7) {
    throw new AppError("Enter the EcoCash phone number for this payment.");
  }
  const context = await supabaseAdmin.rpc("storefront_paynow_context", { _slug: input.slug });
  if (context.error) dbFail("load shop for Paynow", context.error);
  const ctx = context.data as { businessId?: string; storeName?: string } | null;
  if (!ctx?.businessId || !ctx.storeName) throw new AppError("This shop is not available.");
  const returnPath = `/store/${input.slug}/order/${input.reference}`;
  const paynow = await merchantPaynow(ctx.businessId, returnPath);
  const paynowReference = `shop-${input.orderId.slice(0, 8)}-${crypto.randomUUID().slice(0, 8)}`;
  const payment = paynow.createPayment(paynowReference, input.email);
  payment.add(`${ctx.storeName} order ${input.reference}`, input.amount);

  let response: InitResponse | undefined;
  try {
    response =
      input.channel === "web"
        ? await paynow.send(payment)
        : await paynow.sendMobile(payment, input.phone ?? "", "ecocash");
  } catch (error) {
    console.error("[shop-paynow] initiate threw", error);
    throw new AppError("Paynow could not start this shop payment. Try again in a moment.");
  }
  if (!response || !response.success || !response.pollUrl) {
    console.error("[shop-paynow] initiate failed", response?.error ?? response);
    throw new AppError("Paynow could not start this shop payment. Try again in a moment.");
  }

  const { error } = await supabaseAdmin.from("shop_order_payments").insert({
    business_id: ctx.businessId,
    order_id: input.orderId,
    reference: paynowReference,
    poll_url: response.pollUrl,
    status: "created",
    amount: input.amount,
    currency: input.currency,
    channel: input.channel,
  });
  if (error) dbFail("record shop Paynow payment", error);

  return {
    ...(response.redirectUrl ? { redirectUrl: response.redirectUrl } : {}),
    ...(response.instructions ? { instructions: response.instructions } : {}),
    paynowReference,
  };
}

const FAILURE_STATUSES = new Set(["cancelled", "disputed"]);

export async function pollAndConfirmShopPayment(
  reference: string,
  pollUrl: string,
  businessId: string,
): Promise<"paid" | "pending" | "failed"> {
  const { data, error } = await supabaseAdmin
    .from("store_paynow_credentials")
    .select("ciphertext")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error || !data?.ciphertext) return "pending";
  const secrets = openPaynowSecrets(data.ciphertext);
  const paynow = new Paynow(secrets.integrationId, secrets.integrationKey);

  let rawBody: string;
  try {
    const res = await fetch(pollUrl, { method: "POST" });
    rawBody = await res.text();
  } catch (cause) {
    console.error("[shop-paynow] poll request failed", cause);
    return "pending";
  }

  let statusResponse;
  try {
    statusResponse = paynow.parseStatusUpdate(rawBody);
  } catch (cause) {
    console.error("[shop-paynow] poll hash failed", cause);
    return "pending";
  }

  const status = (statusResponse.status ?? "").toLowerCase();
  const paynowReference = statusResponse.paynowReference ?? null;
  if (status === "paid") {
    const { error: confirmError } = await supabaseAdmin.rpc("confirm_shop_paynow_payment", {
      _reference: reference,
      _provider_reference: paynowReference as never,
      _raw_status: (statusResponse.status ?? null) as never,
      _paid: true,
    });
    if (confirmError) console.error("[shop-paynow] confirm", confirmError);
    return "paid";
  }
  if (FAILURE_STATUSES.has(status)) {
    await supabaseAdmin.rpc("confirm_shop_paynow_payment", {
      _reference: reference,
      _provider_reference: paynowReference as never,
      _raw_status: (statusResponse.status ?? null) as never,
      _paid: false,
    });
    return "failed";
  }
  return "pending";
}

export async function refreshShopPaynowForOrder(orderId: string): Promise<void> {
  const pending = await supabaseAdmin
    .from("shop_order_payments")
    .select("reference, poll_url, business_id")
    .eq("order_id", orderId)
    .eq("status", "created")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (pending.error || !pending.data) return;
  await pollAndConfirmShopPayment(
    pending.data.reference,
    pending.data.poll_url,
    pending.data.business_id,
  );
}

export async function shopOrderId(slug: string, reference: string): Promise<string | null> {
  const result = await supabaseAdmin.rpc("storefront_order_id", {
    _slug: slug,
    _reference: reference,
  });
  if (result.error) dbFail("shop order id", result.error);
  return result.data ? String(result.data) : null;
}

export function paynowReferenceFromBody(raw: string): string | null {
  const params = new URLSearchParams(raw);
  const reference = params.get("reference") ?? params.get("Reference");
  return reference?.trim() || null;
}
