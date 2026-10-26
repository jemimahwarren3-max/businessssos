// Paynow doesn't do stored-card recurring billing on a standard merchant
// account (per Paynow's own onboarding guidance — tokenisation has to be
// asked for separately and isn't guaranteed) — so this is a "pay for one
// period at a time" model: initiate a payment for the chosen plan/interval,
// confirm it, extend current_period_end. Renewal is the same flow run again
// closer to the period's end, not an automatic charge.
//
// We never trust a status straight off the wire (the resulturl webhook body
// is unauthenticated and, per the shipped SDK, only actually hash-verified
// via parseStatusUpdate — see the note in src/types/paynow.d.ts). Instead we
// always re-fetch the stored poll_url ourselves and verify Paynow's SHA512
// hash on that response before crediting anything.
import { Paynow, type InitResponse } from "paynow";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  isSubscriptionCurrency,
  planAmountForCurrency,
  type PaidPlan,
  type SubscriptionCurrency,
} from "@/lib/billing-plans";
import type { SubscriptionCheckoutInput } from "@/lib/business.schemas";
import {
  AppError,
  dbFail,
  invalidateWorkspaceCacheForBusiness,
  type Db,
} from "@/lib/business.server";
import { amountToMinorUnits, fetchPaynowPollResponse } from "./paynow-poll";

function getAppUrl(): string {
  const url = process.env["APP_URL"];
  if (!url) {
    throw new AppError("Payments aren't configured yet (missing APP_URL). Ask your admin.");
  }
  return url.replace(/\/+$/, "");
}

function getPlatformPaynowCredentials(currency: SubscriptionCurrency) {
  const integrationId =
    currency === "USD"
      ? process.env["PAYNOW_INTEGRATION_ID"]
      : process.env["paynow_integration_id_zig"];
  const integrationKey =
    currency === "USD"
      ? process.env["PAYNOW_INTEGRATION_KEY"]
      : process.env["paynow_integration_key_zig"];
  return integrationId && integrationKey ? { integrationId, integrationKey } : null;
}

function createPaynowClient(currency: SubscriptionCurrency): Paynow {
  const credentials = getPlatformPaynowCredentials(currency);
  if (!credentials) {
    throw new AppError(
      `${currency === "ZWG" ? "ZiG" : "USD"} subscription payments aren't configured yet.`,
    );
  }
  const appUrl = getAppUrl();
  return new Paynow(
    credentials.integrationId,
    credentials.integrationKey,
    `${appUrl}/api/webhooks/paynow`,
    `${appUrl}/settings/billing`,
  );
}

export function verifyPlatformPaynowWebhookBody(
  raw: string,
  currency: string,
  expectedReference: string,
): boolean {
  if (!isSubscriptionCurrency(currency)) return false;
  const credentials = getPlatformPaynowCredentials(currency);
  if (!credentials) return false;

  try {
    const paynow = new Paynow(credentials.integrationId, credentials.integrationKey);
    return paynow.parseStatusUpdate(raw).reference?.trim() === expectedReference;
  } catch (error) {
    console.error(`[paynow webhook] ${currency} platform hash verification failed`, error);
    return false;
  }
}

const PLAN_LABEL: Record<PaidPlan, string> = {
  pro: "Pro",
};

export type CheckoutResult = {
  reference: string;
  redirectUrl: string | undefined;
  instructions: string | undefined;
};

export async function initiateSubscriptionCheckout(
  supabase: Db,
  input: SubscriptionCheckoutInput,
  authEmail: string,
): Promise<CheckoutResult> {
  const plan = input.plan as PaidPlan;
  const currency = input.currency;
  const amount = planAmountForCurrency(plan, currency);
  const referencePrefix = currency === "ZWG" ? "sub-zig" : "sub";
  const reference = `${referencePrefix}-${input.businessId}-${crypto.randomUUID()}`;

  const paynow = createPaynowClient(currency);
  const payment = paynow.createPayment(reference, authEmail);
  payment.add(`Kwetuu ${PLAN_LABEL[plan]} plan (monthly)`, amount);

  let response: InitResponse | undefined;
  try {
    response =
      input.channel === "web"
        ? await paynow.send(payment)
        : await paynow.sendMobile(payment, input.phone ?? "", input.channel);
  } catch (error) {
    console.error("[paynow] checkout initiation threw", error);
    throw new AppError("Paynow couldn't start this payment. Please try again in a moment.");
  }

  if (!response || !response.success || !response.pollUrl) {
    console.error("[paynow] checkout initiation failed", response);
    throw new AppError("Paynow couldn't start this payment. Please try again in a moment.");
  }

  const { error: rpcError } = await supabase.rpc("record_subscription_payment", {
    _business_id: input.businessId,
    _reference: reference,
    _plan: plan,
    _interval: "month",
    _amount: amount,
    _currency: currency,
    _poll_url: response.pollUrl,
  });
  if (rpcError) dbFail("record subscription payment", rpcError);

  return { reference, redirectUrl: response.redirectUrl, instructions: response.instructions };
}

export type PaynowPollResult = "paid" | "pending" | "failed";

// Paynow's own status vocabulary beyond these isn't fully documented where
// we could verify it, so we only ever treat a poll as a definite failure for
// these known-terminal states — anything else (including states we don't
// recognize) is left "pending" and safe to poll again later, rather than
// risk closing out a payment that's actually still in progress.
const FAILURE_STATUSES = new Set(["cancelled", "disputed"]);

export async function pollAndConfirmPayment(
  reference: string,
  pollUrl: string,
): Promise<PaynowPollResult> {
  const { data: attempt, error: attemptError } = await supabaseAdmin
    .from("subscription_payments")
    .select("amount, currency, status")
    .eq("reference", reference)
    .maybeSingle();
  if (attemptError) {
    console.error("[paynow] load subscription payment for verification", attemptError);
    return "pending";
  }
  if (!attempt || attempt.status !== "created" || !isSubscriptionCurrency(attempt.currency)) {
    return "pending";
  }
  const credentials = getPlatformPaynowCredentials(attempt.currency);
  if (!credentials) {
    console.error(`[paynow] ${attempt.currency} subscription polling credentials are missing`);
    return "pending";
  }
  const paynow = new Paynow(credentials.integrationId, credentials.integrationKey);

  let rawBody: string;
  try {
    rawBody = await fetchPaynowPollResponse(pollUrl);
  } catch (error) {
    console.error("[paynow] poll request failed", error);
    return "pending";
  }

  let statusResponse;
  try {
    statusResponse = paynow.parseStatusUpdate(rawBody);
  } catch (error) {
    console.error("[paynow] poll response failed hash verification", error);
    return "pending";
  }

  if (statusResponse.reference?.trim() !== reference) {
    console.error("[paynow] verified poll reference did not match the subscription payment");
    return "pending";
  }
  const expectedAmount = amountToMinorUnits(attempt.amount);
  const reportedAmount = amountToMinorUnits(statusResponse.amount ?? "");
  if (expectedAmount === null || expectedAmount !== reportedAmount) {
    console.error("[paynow] verified poll amount did not match the subscription payment");
    return "pending";
  }

  const status = (statusResponse.status ?? "").toLowerCase();
  const paynowReference = statusResponse.paynowReference ?? null;

  if (status === "paid") {
    const { error } = await supabaseAdmin.rpc("paynow_confirm_payment", {
      _reference: reference,
      _provider_reference: paynowReference,
      _raw_status: statusResponse.status ?? null,
      _paid: true,
    });
    if (error) {
      console.error("[paynow] confirm subscription payment", error);
      return "pending";
    }
    const { data: payment } = await supabaseAdmin
      .from("subscription_payments")
      .select("business_id")
      .eq("reference", reference)
      .maybeSingle();
    if (payment) await invalidateWorkspaceCacheForBusiness(supabaseAdmin, payment.business_id);
    return "paid";
  }

  if (FAILURE_STATUSES.has(status)) {
    const { error } = await supabaseAdmin.rpc("paynow_confirm_payment", {
      _reference: reference,
      _provider_reference: paynowReference,
      _raw_status: statusResponse.status ?? null,
      _paid: false,
    });
    if (error) {
      console.error("[paynow] record failed subscription payment", error);
      return "pending";
    }
    return "failed";
  }

  return "pending";
}

export async function checkSubscriptionPayment(
  supabase: Db,
  businessId: string,
  reference: string,
): Promise<{ status: PaynowPollResult }> {
  const { data: row, error } = await supabase
    .from("subscription_payments")
    .select("reference, poll_url, status")
    .eq("business_id", businessId)
    .eq("reference", reference)
    .maybeSingle();
  if (error) dbFail("load subscription payment", error);
  if (!row) throw new AppError("That payment couldn't be found.");

  if (row.status !== "created") {
    return { status: row.status as PaynowPollResult };
  }

  const result = await pollAndConfirmPayment(row.reference, row.poll_url);
  return { status: result };
}
