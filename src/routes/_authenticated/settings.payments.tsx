import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/hooks/use-workspace";

export const Route = createFileRoute("/_authenticated/settings/payments")({
  head: () => ({
    meta: [{ title: "Payments | Kwetuu" }, { name: "robots", content: "noindex" }],
  }),
  component: PaymentsSettingsPage,
});

function PaymentsSettingsPage() {
  const workspace = useWorkspace();

  if (!workspace.data) {
    return (
      <AppShell businessName="" role="" plan="" title="Payments">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </AppShell>
    );
  }

  return (
    <AppShell
      businessName={workspace.data.business.name}
      role={workspace.data.role}
      plan={workspace.data.plan}
      billingEnabled={workspace.data.billingEnabled}
      title="Payments & billing"
      subtitle="Kwetuu subscription is separate from money your customers pay your shop."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <section className="surface space-y-3 p-5">
          <h2 className="text-base font-semibold">A. Kwetuu billing</h2>
          <p className="text-sm text-muted-foreground">
            Your Pro subscription and platform fees payable to Kwetuu. This does not configure how
            shoppers pay you at checkout.
          </p>
          <p className="text-[13px] text-muted-foreground">
            Publishing your shop and using POS when billing is enforced requires an active Pro plan.
            There is no separate launch-fee SKU today — activation is through subscription.
          </p>
          <Button asChild size="sm">
            <Link to="/settings/billing">Open Kwetuu billing</Link>
          </Button>
        </section>
        <section className="surface space-y-3 p-5">
          <h2 className="text-base font-semibold">B. Shop payment methods</h2>
          <p className="text-sm text-muted-foreground">
            Cash, manual EcoCash or bank pay-in, and seller Paynow (when approved) for customer
            orders. Credentials stay on the server — never in the browser.
          </p>
          <Button asChild size="sm" variant="outline">
            <Link to="/storefront" hash="launch-payments">
              Configure shop payments
            </Link>
          </Button>
        </section>
      </div>
    </AppShell>
  );
}
