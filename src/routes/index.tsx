import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, ShoppingBag, Store, Wallet } from "lucide-react";
import { MarketingShell } from "@/components/marketing-shell";
import { PublishedShopGrid } from "@/components/storefront/published-shop-card";
import { TemplatePreview } from "@/components/storefront/template-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";
import { EMPTY_MARKETPLACE } from "@/lib/storefront/contract";
import { featuredPublishedShops } from "@/lib/storefront/published-shops";
import { getMarketplaceFn } from "@/lib/storefront/storefront.functions";
import { STORE_TEMPLATES } from "@/lib/storefront/templates";

export const Route = createFileRoute("/")({
  loader: async () => {
    try {
      return await getMarketplaceFn({ data: {} });
    } catch {
      return EMPTY_MARKETPLACE;
    }
  },
  head: () => ({
    meta: [
      { title: `${BRAND.name}: Open an online shop for your business` },
      {
        name: "description",
        content:
          "Create a shop, add products from your catalogue, take cash or Paynow, and share a live storefront. Built for small businesses, including Zimbabwe.",
      },
      { property: "og:title", content: `${BRAND.name}: Open an online shop` },
      {
        property: "og:description",
        content: "Sign up, set up your shop, publish products, and take orders.",
      },
    ],
  }),
  component: Landing,
  errorComponent: LandingError,
});

function LandingError({ error }: { error: Error }) {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-6xl px-4 py-16">
        <h1 className="text-3xl font-extrabold tracking-tight">Open your shop</h1>
        <p className="mt-3 text-sm text-destructive">{error.message}</p>
        <Button asChild className="mt-6">
          <Link to="/auth" search={{ mode: "signup" }}>
            Create your shop
          </Link>
        </Button>
      </div>
    </MarketingShell>
  );
}

function Landing() {
  const market = Route.useLoaderData();
  const featuredShops = featuredPublishedShops(market.shops);
  const heroTemplate =
    STORE_TEMPLATES.find((t) => t.id === "fashion-boutique") ?? STORE_TEMPLATES[0]!;
  return (
    <MarketingShell>
      <section className="relative overflow-hidden">
        <div className="grid-backdrop pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-16 sm:pt-20 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <Badge variant="secondary" className="mb-5 gap-1.5 rounded-full px-3 py-1 font-medium">
              {BRAND.domain}
            </Badge>
            <h1 className="max-w-3xl text-4xl font-extrabold leading-[1.08] tracking-tight text-foreground sm:text-6xl">
              Open your shop. <span className="brand-gradient-text">Sell today.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              {BRAND.name} is a store, a till, and honest stock in one place. Customers shop your
              catalogue. You take cash on pickup or your own Paynow keys. This is not a demo
              storefront glued onto empty pages.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="gap-2">
                <Link to="/auth" search={{ mode: "signup" }}>
                  Create your shop <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/templates">See 10 layouts</Link>
              </Button>
            </div>
            <p className="mt-4 text-[13px] text-muted-foreground">
              Free during beta · No card required · Live shops at /store/your-slug until wildcard
              DNS is on
            </p>
          </div>
          <div className="relative">
            <TemplatePreview
              template={heroTemplate}
              className="aspect-[4/5] shadow-xl sm:aspect-[5/4] lg:aspect-[4/5]"
            />
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              {heroTemplate.sampleLabel} · {heroTemplate.name}
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: Store,
              title: "Your storefront",
              body: "Pick a template. Products you publish here are the products shoppers see.",
            },
            {
              icon: ShoppingBag,
              title: "Cart and checkout",
              body: "Pickup, delivery, or a quote. Cash now; EcoCash and cards when you add Paynow.",
            },
            {
              icon: Wallet,
              title: "Till and stock",
              body: "The same catalogue runs the counter. A sale writes a stock movement.",
            },
          ].map((item) => (
            <div key={item.title} className="surface p-5">
              <item.icon className="size-5 text-primary" aria-hidden="true" />
              <h2 className="mt-3 text-base font-semibold">{item.title}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
          From sign-up to a live link
        </h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-4">
          {[
            { t: "Create the business", b: "Name, category, currency." },
            { t: "Choose a template", b: "Ten layouts, one catalogue." },
            { t: "Add a product", b: "Price, stock, publish it to the shop." },
            { t: "Share the shop", b: "Preview, then publish the public URL." },
          ].map((step, i) => (
            <li key={step.t} className="surface p-5">
              <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                {i + 1}
              </span>
              <h3 className="mt-3 text-base font-semibold">{step.t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{step.b}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Live shops</h2>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Real published shops from the database. Templates below are labelled samples, not
              these catalogues.
            </p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/stores">See all</Link>
          </Button>
        </div>
        <div className="mt-8">
          <PublishedShopGrid shops={featuredShops} />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Templates</h2>
          <Button asChild variant="ghost" size="sm">
            <Link to="/templates">See all</Link>
          </Button>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STORE_TEMPLATES.slice(0, 6).map((template) => (
            <div key={template.id} className="surface overflow-hidden p-0">
              <TemplatePreview template={template} className="h-36 rounded-none border-0" />
              <div className="p-5">
                <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
                  {template.bestFor}
                </p>
                <h3 className="mt-2 text-base font-semibold">{template.name}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{template.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="rounded-2xl bg-primary-dark px-6 py-12 text-center sm:px-12">
          <h2 className="text-2xl font-bold tracking-tight text-primary-foreground sm:text-3xl">
            Start with a real shop, not an empty dashboard
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-primary-foreground/80">
            After you register, we walk you through name, template, first product, and publish.
          </p>
          <Button asChild size="lg" variant="secondary" className="mt-7 gap-2">
            <Link to="/auth" search={{ mode: "signup" }}>
              Open a shop <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
          <p className="mx-auto mt-4 flex items-center justify-center gap-2 text-xs text-primary-foreground/70">
            <Check className="size-3.5" aria-hidden="true" />
            Merchant payments use that shop's Paynow keys, never platform billing keys.
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}
