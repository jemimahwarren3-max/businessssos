import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { MarketingShell } from "@/components/marketing-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";
import { PLAN_MONTHLY_USD } from "@/lib/billing-plans";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: `Pricing | ${BRAND.name}` },
      {
        name: "description",
        content: `${BRAND.name} is free during beta. The listed Pro price is what billing will charge after notice.`,
      },
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-6xl px-4 py-16">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Pricing</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          The product is free for founding users. If billing is turned on later, Pro is $
          {PLAN_MONTHLY_USD.pro}/month. You get notice before anything is charged. Merchant Paynow
          fees are between the shop and Paynow, not this price.
        </p>
        <div className="surface relative mt-10 max-w-xl border-primary p-6 shadow-raised">
          <Badge className="absolute -top-2.5 left-6">Founding beta</Badge>
          <h2 className="text-base font-semibold">Kwetuu</h2>
          <p className="mt-2 text-3xl font-bold tracking-tight">
            $0
            <span className="text-sm font-medium text-muted-foreground"> /month for now</span>
          </p>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            {[
              "Online shop with templates and checkout",
              "Inventory, till, invoices",
              "Marketplace listing when you opt in",
              "Your own Paynow keys for shopper payments",
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <Button asChild className="mt-6 w-full">
            <Link to="/auth" search={{ mode: "signup" }}>
              Join the free beta
            </Link>
          </Button>
        </div>
      </div>
    </MarketingShell>
  );
}
