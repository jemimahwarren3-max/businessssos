/** Platform subscription Paynow keys, USD vs local ZiG (ZWG) integrations. */
export type SubscriptionBillingCurrency = "USD" | "ZWG";

function readEnv(name: string): string | undefined {
  const value = process.env[name]
    ?.trim()
    .replace(/^['"]|['"]$/g, "")
    .trim();
  return value || undefined;
}

export const PLATFORM_BILLING_CURRENCIES: readonly SubscriptionBillingCurrency[] = ["USD", "ZWG"];

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

export function platformPaynowCredentialPairs(): Array<{
  currency: SubscriptionBillingCurrency;
  integrationId: string;
  integrationKey: string;
}> {
  const pairs: Array<{
    currency: SubscriptionBillingCurrency;
    integrationId: string;
    integrationKey: string;
  }> = [];
  for (const currency of PLATFORM_BILLING_CURRENCIES) {
    const integrationId = paynowIntegrationId(currency);
    const integrationKey = paynowIntegrationKey(currency);
    if (integrationId && integrationKey) {
      pairs.push({ currency, integrationId, integrationKey });
    }
  }
  return pairs;
}
