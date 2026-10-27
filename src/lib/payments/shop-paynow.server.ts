import { Paynow, type InitResponse } from "paynow";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AppError, dbFail } from "@/lib/business.server";
import {
  hasCurrentShopPaynowEncryptionKey,
  openPaynowSecrets,
  sealPaynowSecrets,
} from "./paynow-seal";
import { amountToMinorUnits, fetchPaynowPollResponse, isPaynowPollUrl } from "./paynow-poll";

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
  const secrets = await openAndRotateShopPaynowCredentials(businessId, data.ciphertext);
  const appUrl = getAppUrl();
  return new Paynow(
    secrets.integrationId,
    secrets.integrationKey,
    `${appUrl}/api/webhooks/paynow`,
    `${appUrl}${returnPath}`,
  );
}

async function openAndRotateShopPaynowCredentials(
  businessId: string,
  ciphertext: string,
): Promise<ReturnType<typeof openPaynowSecrets>> {
  const secrets = openPaynowSecrets(ciphertext);
  if (secrets.needsReEncryption && hasCurrentShopPaynowEncryptionKey()) {
    const { error } = await supabaseAdmin
      .from("store_paynow_credentials")
      .update({
        ciphertext: sealPaynowSecrets({
          integrationId: secrets.integrationId,
          integrationKey: secrets.integrationKey,
        }),
        updated_at: new Date().toISOString(),
      })
      .eq("business_id", businessId)
      .eq("ciphertext", ciphertext);
    if (error) dbFail("rotate shop Paynow credential encryption", error);
  }
  return secrets;
}

export async function saveShopPaynowCredentials(
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
  if (input.currency !== "USD") {
    throw new AppError("Shop Paynow checkout is currently limited to USD orders.");
  }
  if (input.channel === "ecocash" && (input.phone ?? "").replace(/\D/g, "").length < 7) {
    throw new AppError("Enter the EcoCash phone number for this payment.");
  }
  const { data: available, error: availabilityError } = await supabaseAdmin.rpc(
    "shop_offers_paynow",
    { _slug: input.slug },
  );
  if (availabilityError) dbFail("check shop Paynow eligibility", availabilityError);
  if (available !== true) {
    throw new AppError(
      "Automated Paynow checkout is disabled until the provider and Kwetuu approve this setup.",
    );
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
  if (!isPaynowPollUrl(response.pollUrl)) {
    console.error("[shop-paynow] provider returned an invalid poll URL");
    throw new AppError("Paynow returned an invalid payment-status link. Try another method.");
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
  if (error) {
    console.error("[shop-paynow] load shop credentials for poll", error);
    return "pending";
  }
  if (!data?.ciphertext) {
    console.error("[shop-paynow] shop credentials are missing for a pending payment");
    return "pending";
  }
  const secrets = await openAndRotateShopPaynowCredentials(businessId, data.ciphertext);
  const paynow = new Paynow(secrets.integrationId, secrets.integrationKey);

  let rawBody: string;
  try {
    rawBody = await fetchPaynowPollResponse(pollUrl);
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
  if (statusResponse.reference?.trim() !== reference) {
    console.error("[shop-paynow] verified poll reference did not match the payment attempt");
    return "pending";
  }

  const attempt = await supabaseAdmin
    .from("shop_order_payments")
    .select("amount, currency, status")
    .eq("reference", reference)
    .eq("business_id", businessId)
    .maybeSingle();
  if (attempt.error) {
    console.error("[shop-paynow] load attempt for verification", attempt.error);
    return "pending";
  }
  if (!attempt.data || attempt.data.status !== "created" || attempt.data.currency !== "USD") {
    return "pending";
  }
  const expectedAmount = amountToMinorUnits(attempt.data.amount);
  const reportedAmount = amountToMinorUnits(statusResponse.amount ?? "");
  if (expectedAmount === null || expectedAmount !== reportedAmount) {
    console.error("[shop-paynow] verified poll amount did not match the payment attempt");
    return "pending";
  }

  if (status === "paid") {
    const { data: result, error: confirmError } = await supabaseAdmin.rpc(
      "confirm_shop_paynow_payment",
      {
        _reference: reference,
        _provider_reference: paynowReference,
        _raw_status: statusResponse.status ?? null,
        _paid: true,
      },
    );
    if (confirmError) {
      console.error("[shop-paynow] confirm", confirmError);
      return "pending";
    }
    return result === "paid" ? "paid" : "pending";
  }
  if (FAILURE_STATUSES.has(status)) {
    const { data: result, error: confirmError } = await supabaseAdmin.rpc(
      "confirm_shop_paynow_payment",
      {
        _reference: reference,
        _provider_reference: paynowReference,
        _raw_status: statusResponse.status ?? null,
        _paid: false,
      },
    );
    if (confirmError) {
      console.error("[shop-paynow] record failure", confirmError);
      return "pending";
    }
    return result === "failed" ? "failed" : "pending";
  }
  return "pending";
}

export async function verifyShopPaynowWebhookBody(
  rawBody: string,
  reference: string,
  businessId: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("store_paynow_credentials")
    .select("ciphertext")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) dbFail("load shop Paynow credentials for callback", error);
  if (!data?.ciphertext) return false;
  const secrets = await openAndRotateShopPaynowCredentials(businessId, data.ciphertext);
  const paynow = new Paynow(secrets.integrationId, secrets.integrationKey);
  try {
    const notification = paynow.parseStatusUpdate(rawBody);
    return notification.reference?.trim() === reference;
  } catch (error) {
    console.error("[shop-paynow] callback hash verification failed", error);
    return false;
  }
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
  if (pending.error) {
    console.error("[shop-paynow] load pending payment for order refresh", pending.error);
    return;
  }
  if (!pending.data) return;
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
