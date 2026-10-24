import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CreditCard, Loader2, RefreshCw, Smartphone, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { hasPermission, useWorkspace } from "@/hooks/use-workspace";
import {
  checkSubscriptionPaymentFn,
  getBilling,
  startSubscriptionCheckout,
} from "@/lib/business.functions";
import {
  PLAN_MONTHLY_USD,
  planAmountUsd,
  planAmountZig,
  type PlatformFx,
} from "@/lib/billing-plans";
import { getPlatformFxFn } from "@/lib/storefront/storefront.functions";
import { formatMoney, friendlyDate, readableError } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/settings/billing")({
  head: () => ({
    meta: [{ title: "Billing | Kwetuu" }],
  }),
  component: Billing,
});

function subscriptionStatusMeta(status: string) {
  switch (status) {
    case "trialing":
      return { label: "Trial", className: "bg-warning-soft text-warning-foreground" };
    case "active":
      return { label: "Active", className: "bg-success-soft text-success" };
    case "past_due":
      return { label: "Past due", className: "bg-danger-soft text-destructive" };
    case "canceled":
      return { label: "Cancelled", className: "bg-muted text-muted-foreground" };
    case "unpaid":
      return { label: "Unpaid", className: "bg-danger-soft text-destructive" };
    default:
      return { label: status, className: "bg-muted text-muted-foreground" };
  }
}

function paymentStatusMeta(status: string) {
  switch (status) {
    case "paid":
      return { label: "Paid", className: "bg-success-soft text-success" };
    case "failed":
      return { label: "Failed", className: "bg-danger-soft text-destructive" };
    default:
      return { label: "Awaiting payment", className: "bg-warning-soft text-warning-foreground" };
  }
}

function Billing() {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  const businessId = workspace.data?.business.id;
  const currency = workspace.data?.business.currency ?? "USD";
  const canManageBilling = hasPermission(workspace.data, "business.billing");

  const fetchBilling = useServerFn(getBilling);
  const startCheckout = useServerFn(startSubscriptionCheckout);
  const checkPayment = useServerFn(checkSubscriptionPaymentFn);

  const [channel, setChannel] = useState<"web" | "ecocash" | "onemoney">("web");
  const loadFx = useServerFn(getPlatformFxFn);
  const [fx, setFx] = useState<PlatformFx | null>(null);
  const [phone, setPhone] = useState("");
  const [pendingInstructions, setPendingInstructions] = useState<string | null>(null);

  useEffect(() => {
    if (!workspace.isLoading && workspace.data === null) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [workspace.isLoading, workspace.data, navigate]);

  useEffect(() => {
    void loadFx().then(setFx);
  }, [loadFx]);

  const billing = useQuery({
    queryKey: ["billing", businessId],
    enabled: Boolean(businessId),
    queryFn: () => fetchBilling({ data: { businessId: businessId! } }),
    refetchInterval: (query) =>
      query.state.data?.payments.some((p) => p.status === "created") ? 5000 : false,
  });

  const pendingPayment = billing.data?.payments.find((p) => p.status === "created");

  const checkoutMutation = useMutation({
    mutationFn: () =>
      startCheckout({
        data: { businessId: businessId!, plan: "pro", channel, phone: phone || undefined },
      }),
    onSuccess: async (result) => {
      if (result.redirectUrl) {
        window.location.href = result.redirectUrl;
        return;
      }
      if (result.instructions) {
        setPendingInstructions(result.instructions);
      }
      toast.success("Payment started, complete it on your phone, then check status below.");
      await queryClient.invalidateQueries({ queryKey: ["billing", businessId] });
    },
    onError: (error: Error) => toast.error(readableError(error, "Couldn't start that payment.")),
  });

  const checkMutation = useMutation({
    mutationFn: () =>
      checkPayment({ data: { businessId: businessId!, reference: pendingPayment!.reference } }),
    onSuccess: async (result) => {
      if (result.status === "paid") {
        toast.success("Payment confirmed, your plan is active.");
        setPendingInstructions(null);
      } else if (result.status === "failed") {
        toast.error("That payment didn't go through. You can try again.");
        setPendingInstructions(null);
      } else {
        toast("Still waiting for payment confirmation.");
      }
      await queryClient.invalidateQueries({ queryKey: ["billing", businessId] });
    },
    onError: (error: Error) => toast.error(readableError(error, "Couldn't check that payment.")),
  });

  if (workspace.isLoading || !workspace.data) {
    return (
      <AppShell
        businessName=""
        role=""
        plan=""
        title="Billing"
        subtitle="Manage your Kwetuu subscription."
      >
        <Skeleton className="h-64" />
      </AppShell>
    );
  }

  const subscription = billing.data?.subscription;
  const statusMeta = subscription ? subscriptionStatusMeta(subscription.status) : null;
  const billingEnabled = workspace.data.billingEnabled;

  return (
    <AppShell
      businessName={workspace.data.business.name}
      role={workspace.data.role}
      plan={workspace.data.plan}
      isReadOnly={workspace.data.isReadOnly}
      billingEnabled={workspace.data.billingEnabled}
      title="Billing"
      subtitle="Manage your Kwetuu subscription."
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <div className="surface space-y-3 p-5">
            <h2 className="text-lg font-semibold">Current plan</h2>
            {!billingEnabled ? (
              <div className="flex items-start gap-2.5">
                <Sparkles className="mt-0.5 size-4.5 shrink-0 text-primary" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">
                  Kwetuu is currently free while we build with our founding users. Every feature is
                  unlocked, no card required. Pricing may be introduced later, and we'll give you
                  clear notice before anything changes.
                </p>
              </div>
            ) : billing.isLoading ? (
              <Skeleton className="h-16" />
            ) : subscription ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl font-semibold capitalize">{subscription.plan}</span>
                  {statusMeta ? (
                    <Badge className={statusMeta.className} variant="outline">
                      {statusMeta.label}
                    </Badge>
                  ) : null}
                </div>
                {!workspace.data.isPlatformOwner &&
                subscription.status === "trialing" &&
                subscription.trial_ends_at ? (
                  <p className="text-sm text-muted-foreground">
                    Trial ends {friendlyDate(subscription.trial_ends_at)}. Pay for a plan below to
                    keep access after that.
                  </p>
                ) : subscription.current_period_end ? (
                  <p className="text-sm text-muted-foreground">
                    Current period ends {friendlyDate(subscription.current_period_end)}.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No subscription found yet.</p>
            )}
            {workspace.data.isPlatformOwner ? (
              <p className="rounded-lg bg-info-soft p-3 text-sm text-info">
                Platform owner access is a separate entitlement. No subscription payment is
                required; the subscription and payment history shown here remain actual billing
                records.
              </p>
            ) : null}
          </div>

          {!billingEnabled || workspace.data.isPlatformOwner ? null : !canManageBilling ? (
            <div className="surface p-5 text-sm text-muted-foreground">
              Only an owner or admin can manage billing for this business.
            </div>
          ) : (
            <div className="surface space-y-4 p-5">
              <h2 className="text-lg font-semibold">Pay with Paynow</h2>

              <div className="space-y-2">
                <Label>Plan</Label>
                <div className="rounded-lg border border-primary bg-primary/5 p-3">
                  <span className="text-sm font-semibold">Pro</span>
                  <span className="ml-2 text-[13px] text-muted-foreground">
                    ${PLAN_MONTHLY_USD.pro}/mo USD
                    {planAmountZig(PLAN_MONTHLY_USD.pro, fx) != null
                      ? ` · about ${formatMoney(planAmountZig(PLAN_MONTHLY_USD.pro, fx)!, "ZWG")} (display only)`
                      : ""}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Payment method</Label>
                <RadioGroup
                  value={channel}
                  onValueChange={(v) => setChannel(v as "web" | "ecocash" | "onemoney")}
                  className="grid grid-cols-3 gap-2"
                >
                  <label className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-border p-2.5 text-center has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                    <RadioGroupItem value="web" className="sr-only" />
                    <CreditCard className="size-4" aria-hidden="true" />
                    <span className="text-[13px]">Card</span>
                  </label>
                  <label className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-border p-2.5 text-center has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                    <RadioGroupItem value="ecocash" className="sr-only" />
                    <Smartphone className="size-4" aria-hidden="true" />
                    <span className="text-[13px]">EcoCash</span>
                  </label>
                  <label className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-border p-2.5 text-center has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                    <RadioGroupItem value="onemoney" className="sr-only" />
                    <Smartphone className="size-4" aria-hidden="true" />
                    <span className="text-[13px]">OneMoney</span>
                  </label>
                </RadioGroup>
              </div>

              {channel !== "web" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="billing-phone">Mobile money number</Label>
                  <Input
                    id="billing-phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="077xxxxxxx"
                  />
                </div>
              ) : null}

              <Button
                className="w-full gap-1.5"
                size="lg"
                disabled={checkoutMutation.isPending || (channel !== "web" && !phone.trim())}
                onClick={() => checkoutMutation.mutate()}
              >
                {checkoutMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : null}
                Pay {formatMoney(planAmountUsd("pro"), currency)}
              </Button>

              {pendingInstructions ? (
                <p className="rounded-lg bg-info-soft p-3 text-[13px] text-info">
                  {pendingInstructions}
                </p>
              ) : null}

              {pendingPayment ? (
                <Button
                  variant="outline"
                  className="w-full gap-1.5"
                  disabled={checkMutation.isPending}
                  onClick={() => checkMutation.mutate()}
                >
                  {checkMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <RefreshCw className="size-4" aria-hidden="true" />
                  )}
                  I've paid, check status
                </Button>
              ) : null}
            </div>
          )}
        </div>

        <div className="surface h-fit space-y-3 p-5">
          <h2 className="text-lg font-semibold">Payment history</h2>
          {billing.isLoading ? (
            <Skeleton className="h-32" />
          ) : !billing.data || billing.data.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments yet.</p>
          ) : (
            <ul className="space-y-2">
              {billing.data.payments.map((payment) => {
                const meta = paymentStatusMeta(payment.status);
                return (
                  <li
                    key={payment.reference}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5 text-[13px]"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium capitalize">
                        {payment.plan} · {payment.interval}ly
                      </p>
                      <p className="text-muted-foreground">{friendlyDate(payment.created_at)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold tabular-nums">
                        {formatMoney(Number(payment.amount), payment.currency)}
                      </p>
                      <Badge className={meta.className} variant="outline">
                        {meta.label}
                      </Badge>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}
