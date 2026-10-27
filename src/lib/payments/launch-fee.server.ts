import { Paynow, type InitResponse } from "paynow";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { LAUNCH_FEE_USD_DEFAULT } from "@/lib/launch-fee";
import { planAmountZig, type PlatformFx } from "@/lib/billing-plans";
import { loadPlatformFx } from "@/lib/platform-fx-read.server";
import {
  AppError,
  dbFail,
  invalidateWorkspaceCacheForBusiness,
  type Db,
} from "@/lib/business.server";
import { amountToMinorUnits, fetchPaynowPollResponse } from "./paynow-poll";
import {
  paynowCredentialsConfigured,
  paynowIntegrationId,
  paynowIntegrationKey,
  type SubscriptionBillingCurrency,
} from "./paynow-credentials.server";
import type { PaynowPollResult } from "./paynow.server";

function getAppUrl(): string {
  const url = process.env["APP_URL"];
  if (!url) {
    throw new AppError("Payments aren't configured yet (missing APP_URL). Ask your admin.");
  }
  return url.replace(/\/+$/, "");
}

function createPaynowClient(currency: SubscriptionBillingCurrency): Paynow {
  const integrationId = paynowIntegrationId(currency);
  const integrationKey = paynowIntegrationKey(currency);
  if (!integrationId || !integrationKey) {
    const label = currency === "ZWG" ? "ZiG (ZWG)" : "USD";
    throw new AppError(
      `Paynow isn't set up for ${label} yet. Ask your admin to configure the matching integration keys.`,
    );
  }
  const appUrl = getAppUrl();
  return new Paynow(
    integrationId,
    integrationKey,
    `${appUrl}/api/webhooks/paynow`,
    `${appUrl}/storefront`,
  );
}

async function resolveLaunchCurrency(supabase: Db, businessId: string): Promise<SubscriptionBillingCurrency> {
  const { data: business, error } = await supabase
    .from("businesses")
    .select("currency")
    .eq("id", businessId)
    .maybeSingle();
  if (error) dbFail("load business currency for launch fee", error);
  const businessCurrency = (business?.currency ?? "USD").toUpperCase();
  if (businessCurrency === "ZWG" && paynowCredentialsConfigured("ZWG")) {
    return "ZWG";
  }
  return "USD";
}

async function launchFeeAmount(
  supabase: Db,
  currency: SubscriptionBillingCurrency,
): Promise<number> {
  const { data, error } = await supabase.rpc("platform_launch_fee_usd" as never, {} as never);
  if (error) dbFail("load launch fee amount", error);
  const usd = typeof data === "number" ? data : Number(data ?? LAUNCH_FEE_USD_DEFAULT);
  if (currency === "USD") return usd;
  const fx = await loadPlatformFx();
  const zig = planAmountZig(usd, fx as PlatformFx | null);
  if (zig == null || !(zig > 0)) {
    throw new AppError(
      "ZiG launch pricing isn't available right now. Try USD or ask support to refresh the platform exchange rate.",
    );
  }
  return zig;
}

export type LaunchCheckoutResult = {
  reference: string;
  redirectUrl: string | undefined;
  instructions: string | undefined;
  amount: number;
  currency: SubscriptionBillingCurrency;
};

export async function initiateStoreLaunchCheckout(
  supabase: Db,
  businessId: string,
  authEmail: string,
): Promise<LaunchCheckoutResult> {
  const currency = await resolveLaunchCurrency(supabase, businessId);
  if (!paynowCredentialsConfigured(currency)) {
    throw new AppError("Payments aren't set up yet. Ask your admin to configure Paynow.");
  }
  const amount = await launchFeeAmount(supabase, currency);
  const reference = `launch-${businessId}-${crypto.randomUUID()}`;

  const paynow = createPaynowClient(currency);
  const payment = paynow.createPayment(reference, authEmail);
  payment.add("Kwetuu store launch fee", amount);

  let response: InitResponse | undefined;
  try {
    response = await paynow.send(payment);
  } catch (error) {
    console.error("[paynow] launch fee initiation threw", error);
    throw new AppError("Paynow couldn't start this payment. Please try again in a moment.");
  }

  if (!response || !response.success || !response.pollUrl) {
    console.error("[paynow] launch fee initiation failed", response);
    throw new AppError("Paynow couldn't start this payment. Please try again in a moment.");
  }

  const { error: rpcError } = await supabase.rpc("record_storefront_launch_payment" as never, {
    _business_id: businessId,
    _reference: reference,
    _amount: amount,
    _currency: currency,
    _poll_url: response.pollUrl,
  } as never);
  if (rpcError) dbFail("record storefront launch payment", rpcError);

  return {
    reference,
    redirectUrl: response.redirectUrl,
    instructions: response.instructions,
    amount,
    currency,
  };
}

const FAILURE_STATUSES = new Set(["cancelled", "disputed"]);
const SUPPORTED = new Set<SubscriptionBillingCurrency>(["USD", "ZWG"]);

export async function pollAndConfirmLaunchPayment(
  reference: string,
  pollUrl: string,
): Promise<PaynowPollResult> {
  const { data: attempt, error: attemptError } = await (
    supabaseAdmin.from("storefront_launch_payments" as never) as ReturnType<
      typeof supabaseAdmin.from
    >
  )
    .select("amount, currency, status, business_id")
    .eq("reference", reference)
    .maybeSingle();
  type LaunchRow = {
    amount: number;
    currency: string;
    status: string;
    business_id: string;
  };
  const row = attempt as LaunchRow | null;
  if (attemptError) {
    console.error("[paynow] load launch payment for verification", attemptError);
    return "pending";
  }
  const currency = row?.currency as SubscriptionBillingCurrency | undefined;
  if (!row || row.status !== "created" || !currency || !SUPPORTED.has(currency)) {
    return "pending";
  }

  const integrationId = paynowIntegrationId(currency);
  const integrationKey = paynowIntegrationKey(currency);
  if (!integrationId || !integrationKey) {
    return "pending";
  }

  const paynow = new Paynow(integrationId, integrationKey);
  let rawBody: string;
  try {
    rawBody = await fetchPaynowPollResponse(pollUrl);
  } catch (error) {
    console.error("[paynow] launch poll request failed", error);
    return "pending";
  }

  let statusResponse;
  try {
    statusResponse = paynow.parseStatusUpdate(rawBody);
  } catch (error) {
    console.error("[paynow] launch poll failed hash verification", error);
    return "pending";
  }

  if (statusResponse.reference?.trim() !== reference) {
    console.error("[paynow] verified poll reference did not match the launch payment");
    return "pending";
  }
  const expectedAmount = amountToMinorUnits(row.amount);
  const reportedAmount = amountToMinorUnits(statusResponse.amount ?? "");
  if (expectedAmount === null || expectedAmount !== reportedAmount) {
    console.error("[paynow] verified poll amount did not match the launch payment");
    return "pending";
  }

  const status = (statusResponse.status ?? "").toLowerCase();
  const paynowReference = statusResponse.paynowReference ?? null;

  if (status === "paid") {
    const { error } = await supabaseAdmin.rpc("paynow_confirm_launch_payment" as never, {
      _reference: reference,
      _provider_reference: paynowReference,
      _raw_status: statusResponse.status ?? null,
      _paid: true,
    } as never);
    if (error) {
      console.error("[paynow] confirm launch payment", error);
      return "pending";
    }
    if (row.business_id) {
      await invalidateWorkspaceCacheForBusiness(supabaseAdmin, row.business_id);
    }
    return "paid";
  }

  if (FAILURE_STATUSES.has(status)) {
    const { error } = await supabaseAdmin.rpc("paynow_confirm_launch_payment" as never, {
      _reference: reference,
      _provider_reference: paynowReference,
      _raw_status: statusResponse.status ?? null,
      _paid: false,
    } as never);
    if (error) {
      console.error("[paynow] record failed launch payment", error);
      return "pending";
    }
    return "failed";
  }

  return "pending";
}

export async function checkLaunchPayment(
  supabase: Db,
  businessId: string,
  reference: string,
): Promise<{ status: PaynowPollResult }> {
  const { data: paymentRow, error } = await supabase
    .from("storefront_launch_payments" as never)
    .select("reference, poll_url, status")
    .eq("business_id", businessId)
    .eq("reference", reference)
    .maybeSingle();
  if (error) dbFail("load launch payment", error);
  const row = paymentRow as { reference: string; poll_url: string; status: string } | null;
  if (!row) throw new AppError("That payment couldn't be found.");

  if (row.status === "paid") return { status: "paid" };
  if (row.status === "failed" || row.status === "cancelled") return { status: "failed" };

  return { status: await pollAndConfirmLaunchPayment(reference, row.poll_url) };
}
