import { createFileRoute, Link } from "@tanstack/react-router";
import { BarChart3, Boxes, FileText, ReceiptText, Store, Users, Wallet } from "lucide-react";
import { MarketingShell } from "@/components/marketing-shell";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";

export const Route = createFileRoute("/features")({
  head: () => ({
    meta: [
      { title: `Features | ${BRAND.name}` },
      {
        name: "description",
        content: "Storefront, till, stock, invoices, and Paynow checkout on one catalogue.",
      },
    ],
  }),
  component: FeaturesPage,
});

const items = [
  {
    icon: Store,
    title: "Published storefront",
    body: "Templates, branding, cart, checkout, and a public /store/slug URL. Subdomains wait on wildcard DNS.",
  },
  {
    icon: Boxes,
    title: "Catalogue and stock",
    body: "Products you add in inventory can be listed on the shop. Sales write stock movements.",
  },
  {
    icon: ReceiptText,
    title: "Till",
    body: "Counter sales with the same products. Cash drawer and staff sign-in for the floor.",
  },
  {
    icon: Wallet,
    title: "Paynow on the shop",
    body: "Each merchant stores their own Paynow integration. Platform subscription billing is separate.",
  },
  {
    icon: FileText,
    title: "Invoices and quotes",
    body: "Quotes become invoices without retyping. Not a second commerce engine.",
  },
  {
    icon: Users,
    title: "Customers and shoppers",
    body: "Walk-in customers on the till. Guest checkout on the shop, optional shopper accounts.",
  },
  {
    icon: BarChart3,
    title: "Reports",
    body: "Sales, profit, and who owes you — from real records, not sample charts.",
  },
];

function FeaturesPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-6xl px-4 py-16">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">What you get</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          One business record, one product list, one set of orders. The public shop and the till
          read the same database.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div key={item.title} className="surface p-5">
              <item.icon className="size-5 text-primary" aria-hidden="true" />
              <h2 className="mt-3 text-base font-semibold">{item.title}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
        <Button asChild className="mt-10">
          <Link to="/auth" search={{ mode: "signup" }}>
            Open a shop
          </Link>
        </Button>
      </div>
    </MarketingShell>
  );
}
