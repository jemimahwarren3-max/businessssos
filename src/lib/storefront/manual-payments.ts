export const MANUAL_PAYMENT_KINDS = ["ecocash", "innbucks", "bank_transfer", "other"] as const;
export type ManualPaymentKind = (typeof MANUAL_PAYMENT_KINDS)[number];

export type ManualPaymentMethod = {
  id: string;
  kind: ManualPaymentKind;
  enabled: boolean;
  accountName: string;
  accountDetail: string;
  instructions: string;
};

export const MANUAL_PAYMENT_LABELS: Record<ManualPaymentKind, string> = {
  ecocash: "EcoCash",
  innbucks: "InnBucks",
  bank_transfer: "Bank transfer",
  other: "Other instructions",
};

export function emptyManualMethods(): ManualPaymentMethod[] {
  return MANUAL_PAYMENT_KINDS.map((kind) => ({
    id: kind,
    kind,
    enabled: false,
    accountName: "",
    accountDetail: "",
    instructions: "",
  }));
}

export function enabledManualMethods(
  methods: ManualPaymentMethod[] | undefined,
): ManualPaymentMethod[] {
  return (methods ?? []).filter(
    (method) => method.enabled && (method.accountDetail.trim() || method.instructions.trim()),
  );
}

export function mergeManualMethods(
  saved: ManualPaymentMethod[] | undefined,
): ManualPaymentMethod[] {
  const current = saved ?? [];
  return MANUAL_PAYMENT_KINDS.map((kind) => {
    const hit = current.find((method) => method.id === kind || method.kind === kind);
    return hit
      ? {
          id: kind,
          kind,
          enabled: hit.enabled,
          accountName: hit.accountName,
          accountDetail: hit.accountDetail,
          instructions: hit.instructions,
        }
      : {
          id: kind,
          kind,
          enabled: false,
          accountName: "",
          accountDetail: "",
          instructions: "",
        };
  });
}

export function paymentIsUnconfirmedUntilSeller(method: string): boolean {
  return method === "manual" || method === "pay_on_pickup" || method === "pay_on_delivery";
}
