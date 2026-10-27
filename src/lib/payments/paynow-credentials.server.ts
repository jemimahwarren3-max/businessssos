/** Platform subscription Paynow keys — USD vs local ZiG (ZWG) integrations. */
export type SubscriptionBillingCurrency = "USD" | "ZWG";

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export function paynowIntegrationId(currency: SubscriptionBillingCurrency): string | undefined {
  if (currency === "ZWG") {
    return readEnv("PAYNOW_INTEGRATION_ID_ZIG");
  }
  return readEnv("PAYNOW_INTEGRATION_ID");
}

export function paynowIntegrationKey(currency: SubscriptionBillingCurrency): string | undefined {
  if (currency === "ZWG") {
    return readEnv("PAYNOW_INTEGRATION_KEY_ZIG");
  }
  return readEnv("PAYNOW_INTEGRATION_KEY");
}

export function paynowCredentialsConfigured(currency: SubscriptionBillingCurrency): boolean {
  return Boolean(paynowIntegrationId(currency) && paynowIntegrationKey(currency));
}
