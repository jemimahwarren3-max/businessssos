import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney, readableError } from "@/lib/format";
import {
  checkStoreLaunchPaymentFn,
  getStoreLaunchEligibilityFn,
  publishStorefrontFn,
  startStoreLaunchCheckoutFn,
} from "@/lib/storefront/storefront.functions";
import {
  launchEligibilityHeadline,
  type LaunchEligibilityState,
} from "@/lib/storefront/launch-eligibility";
import { toast } from "sonner";

export function StoreLaunchReadiness({
  businessId,
  storeSlug,
  canManage,
}: {
  businessId: string;
  storeSlug?: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(getStoreLaunchEligibilityFn);
  const startPay = useServerFn(startStoreLaunchCheckoutFn);
  const checkPay = useServerFn(checkStoreLaunchPaymentFn);
  const publish = useServerFn(publishStorefrontFn);

  const eligibility = useQuery({
    queryKey: ["store-launch-eligibility", businessId],
    queryFn: () => load({ data: { businessId } }),
  });

  const payMutation = useMutation({
    mutationFn: () => startPay({ data: { businessId } }),
    onSuccess: (result) => {
      if (result.redirectUrl) {
        window.location.href = result.redirectUrl;
        return;
      }
      toast.message("Complete payment using the instructions from Paynow.");
      void queryClient.invalidateQueries({ queryKey: ["store-launch-eligibility", businessId] });
    },
    onError: (error: Error) =>
      toast.error(readableError(error, "Could not start the launch fee payment.")),
  });

  const pollMutation = useMutation({
    mutationFn: async () => {
      const ref = eligibility.data?.latestLaunchPayment?.reference;
      if (!ref) throw new Error("No pending launch payment to check.");
      return checkPay({ data: { businessId, reference: ref } });
    },
    onSuccess: (result) => {
      if (result.status === "paid") {
        toast.success("Launch fee verified — you can publish when ready.");
      } else if (result.status === "failed") {
        toast.error("Payment verification failed. Start a new payment or contact support.");
      } else {
        toast.message("Payment is still pending with Paynow. Try again in a moment.");
      }
      void queryClient.invalidateQueries({ queryKey: ["store-launch-eligibility", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["storefront", businessId] });
    },
    onError: (error: Error) =>
      toast.error(readableError(error, "Could not check payment status.")),
  });

  const publishMutation = useMutation({
    mutationFn: () => publish({ data: { businessId, published: true } }),
    onSuccess: () => {
      toast.success("Shop published");
      void queryClient.invalidateQueries({ queryKey: ["storefront", businessId] });
      void queryClient.invalidateQueries({ queryKey: ["store-launch-eligibility", businessId] });
    },
    onError: (error: Error) => toast.error(readableError(error, "Could not publish the shop.")),
  });

  if (eligibility.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading launch requirements…</p>;
  }
  if (eligibility.isError || !eligibility.data) {
    return (
      <p className="text-sm text-muted-foreground">
        {readableError(
          eligibility.error as Error,
          "Launch requirements could not be loaded. Apply the latest database migration.",
        )}
      </p>
    );
  }

  const data = eligibility.data;
  const state = data.state as LaunchEligibilityState;
  const headline = launchEligibilityHeadline(state);

  return (
    <section className="space-y-3 rounded-xl border p-4" aria-labelledby="launch-readiness-heading">
      <div>
        <h3 id="launch-readiness-heading" className="font-semibold">
          Launch readiness
        </h3>
        <p className="text-sm text-muted-foreground">{headline}</p>
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Setup</dt>
          <dd>{data.setupComplete ? "Complete" : "Incomplete"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Publication</dt>
          <dd className="capitalize">{data.storeStatus}</dd>
        </div>
        {data.billingEnforced && data.launchFeeRequired ? (
          <div>
            <dt className="text-muted-foreground">Launch fee</dt>
            <dd>
              {data.launchFeeWaived
                ? "Waived by Kwetuu"
                : data.launchFeeSatisfied
                  ? "Paid"
                  : formatMoney(data.launchFeeUsd, "USD") + " (Kwetuu platform fee)"}
            </dd>
          </div>
        ) : null}
        {data.billingEnforced ? (
          <div>
            <dt className="text-muted-foreground">Subscription</dt>
            <dd>{data.subscriptionActive ? "Active" : "Required for publish"}</dd>
          </div>
        ) : null}
      </dl>

      {data.latestLaunchPayment?.reference && data.latestLaunchPayment.status === "created" ? (
        <p className="text-xs text-muted-foreground">
          Pending payment ref: {data.latestLaunchPayment.reference.slice(0, 24)}…
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {!data.setupComplete ? (
          <Button asChild size="sm" variant="outline">
            <a href="#store-builder">Complete store setup</a>
          </Button>
        ) : null}
        {storeSlug ? (
          <Button asChild size="sm" variant="outline">
            <Link to="/store/$slug" params={{ slug: storeSlug }} search={{ preview: "1" }}>
              Preview store
            </Link>
          </Button>
        ) : (
          <Button asChild size="sm" variant="outline">
            <a href="#store-builder">Preview in builder</a>
          </Button>
        )}
        {canManage && state === "launch_fee_unpaid" && data.launchFeeRequired ? (
          <Button
            type="button"
            size="sm"
            disabled={payMutation.isPending}
            onClick={() => payMutation.mutate()}
          >
            {payMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Pay launch fee
          </Button>
        ) : null}
        {canManage && state === "payment_pending_verification" ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pollMutation.isPending}
            onClick={() => pollMutation.mutate()}
          >
            {pollMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Check payment status
          </Button>
        ) : null}
        {canManage && state === "subscription_inactive" ? (
          <Button asChild size="sm">
            <Link to="/settings/billing">Go to billing</Link>
          </Button>
        ) : null}
        {canManage && state === "eligible_to_publish" ? (
          <Button
            type="button"
            size="sm"
            disabled={publishMutation.isPending}
            onClick={() => publishMutation.mutate()}
          >
            Publish store
          </Button>
        ) : null}
        {canManage && state === "published" ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={publishMutation.isPending}
            onClick={() =>
              publish({ data: { businessId, published: false } })
                .then(() => {
                  toast.success("Shop unpublished");
                  void queryClient.invalidateQueries({ queryKey: ["store-launch-eligibility", businessId] });
                })
                .catch((error: Error) =>
                  toast.error(readableError(error, "Could not unpublish.")),
                )
            }
          >
            Unpublish
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Kwetuu launch fees are separate from payments your customers make for products. Paynow
        verification uses server-side polling with hash checks — the app never trusts a browser
        redirect alone.
      </p>
    </section>
  );
}
