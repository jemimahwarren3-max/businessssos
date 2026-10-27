import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check } from "lucide-react";
import { MarketingShell } from "@/components/marketing-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { BRAND } from "@/lib/brand";
import { PLAN_MONTHLY_USD, planAmountZig, type PlatformFx } from "@/lib/billing-plans";
import { getPlatformFxFn } from "@/lib/storefront/storefront.functions";
import { formatMoney } from "@/lib/format";

const BETA_FEATURES = [
  "Online shop with templates and checkout",
  "Inventory, till, invoices",
  "Marketplace listing when you opt in",
  "Your own Paynow keys for shopper payments",
];

const PRO_FEATURES = [
  "Everything in the founding beta",
  `$${PLAN_MONTHLY_USD.pro}/month only after we give notice`,
  "Same merchant OS — not a second product",
  "Platform billing uses separate Paynow keys from shop checkout",
];

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
  const loadFx = useServerFn(getPlatformFxFn);
  const [fx, setFx] = useState<PlatformFx | null>(null);
  useEffect(() => {
    void loadFx().then(setFx);
  }, [loadFx]);
  const zig = planAmountZig(PLAN_MONTHLY_USD.pro, fx);
  return (
    <MarketingShell>
      <div className="mx-auto max-w-6xl px-4 py-16">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Pricing</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          The product is free for founding users. If billing is turned on later, Pro is $
          {PLAN_MONTHLY_USD.pro}/month in USD. You get notice before anything is charged.
          {zig != null && fx ? (
            <>
              {" "}
              Displayed ZiG equivalent: {formatMoney(zig, "ZWG")} using {fx.source} on{" "}
              {fx.effectiveOn}. Billing still collects USD. {fx.notice}
            </>
          ) : (
            <> There is no ZiG subscription price until an operator stores a rate and source.</>
          )}{" "}
          Merchant Paynow fees are between the shop and Paynow, not this price. Shopper payments
          never pay this bill.
        </p>
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          <Card className="relative border-primary shadow-raised">
            <Badge className="absolute -top-2.5 left-6">Founding beta</Badge>
            <CardHeader>
              <CardTitle>Kwetuu</CardTitle>
              <p className="text-3xl font-bold tracking-tight">
                $0
                <span className="text-sm font-medium text-muted-foreground"> /month for now</span>
              </p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {BETA_FEATURES.map((item) => (
                  <li key={item} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button asChild className="w-full">
                <Link to="/auth" search={{ mode: "signup" }}>
                  Join the free beta
                </Link>
              </Button>
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Pro</CardTitle>
              <p className="text-3xl font-bold tracking-tight">
                ${PLAN_MONTHLY_USD.pro}
                <span className="text-sm font-medium text-muted-foreground">
                  {" "}
                  /month after notice
                </span>
              </p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {PRO_FEATURES.map((item) => (
                  <li key={item} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button asChild variant="outline" className="w-full">
                <Link to="/auth" search={{ mode: "signup" }}>
                  Start free, upgrade later
                </Link>
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </MarketingShell>
  );
}
