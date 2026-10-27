import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { z } from "zod";
import {
  ArrowRight,
  Check,
  PackagePlus,
  Palette,
  Share2,
  ShoppingBag,
  Store,
  Wallet,
} from "lucide-react";
import { MarketingShell } from "@/components/marketing-shell";
import { PublishedShopGrid } from "@/components/storefront/published-shop-card";
import { TemplatePreview } from "@/components/storefront/template-preview";
import { Button } from "@/components/ui/button";
import { BRAND, HOME_SEO } from "@/lib/brand";
import { PLAN_MONTHLY_USD, planAmountZig } from "@/lib/billing-plans";
import { formatMoney } from "@/lib/format";
import { EMPTY_MARKETPLACE } from "@/lib/storefront/contract";
import { featuredPublishedShops } from "@/lib/storefront/published-shops";
import { getPublicMarketingCopyFn } from "@/lib/admin/admin.functions";
import { getMarketplaceFn, getPlatformFxFn } from "@/lib/storefront/storefront.functions";
import { STORE_TEMPLATES } from "@/lib/storefront/templates";
import { storePublicUrl } from "@/lib/storefront/host";

const landingSearchSchema = z.object({
  code: z.string().min(1).optional().catch(undefined),
  type: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/")({
  validateSearch: landingSearchSchema,
  beforeLoad: ({ search }) => {
    if (search.code) {
      const to = search.type === "recovery" ? "/auth/recover" : "/auth/confirm";
      throw redirect({ to, search: { code: search.code } });
    }
  },
  loader: async () => {
    const [market, fx, marketing] = await Promise.all([
      getMarketplaceFn({ data: {} }).catch(() => EMPTY_MARKETPLACE),
      getPlatformFxFn().catch(() => null),
      getPublicMarketingCopyFn().catch(() => ({ heroTitle: null, heroSubtitle: null })),
    ]);
    return { market, fx, marketing };
  },
  head: () => {
    const jsonLd = JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebSite",
          "@id": `${BRAND.appUrl}/#website`,
          url: BRAND.appUrl,
          name: BRAND.name,
          description: HOME_SEO.description,
          publisher: { "@id": `${BRAND.appUrl}/#organization` },
        },
        {
          "@type": "Organization",
          "@id": `${BRAND.appUrl}/#organization`,
          name: BRAND.name,
          url: BRAND.appUrl,
          logo: `${BRAND.appUrl}/kwetuu-logo.png`,
        },
      ],
    }).replace(/</g, "\\u003c");
    return {
      meta: [
        { title: HOME_SEO.title },
        { name: "description", content: HOME_SEO.description },
        { name: "robots", content: "index,follow" },
        { property: "og:title", content: HOME_SEO.title },
        { property: "og:description", content: HOME_SEO.ogDescription },
        { property: "og:url", content: BRAND.appUrl },
        { property: "og:image", content: `${BRAND.appUrl}/kwetuu-logo.png` },
        { name: "twitter:title", content: HOME_SEO.title },
        { name: "twitter:description", content: HOME_SEO.description },
        { name: "twitter:image", content: `${BRAND.appUrl}/kwetuu-logo.png` },
      ],
      scripts: [{ type: "application/ld+json", children: jsonLd }],
      links: [{ rel: "canonical", href: BRAND.appUrl }],
    };
  },
  component: Landing,
  errorComponent: LandingError,
});

const SETUP_STEPS = [
  { icon: Store, title: "Name your shop", body: "Tell us what you sell. That's it." },
  { icon: PackagePlus, title: "Add your products", body: "Snap a photo, type a price." },
  { icon: Palette, title: "Pick a design", body: "60 storefront designs for ten shop categories." },
  { icon: Wallet, title: "Say how you get paid", body: "EcoCash, bank, InnBucks or cash." },
  { icon: Share2, title: "Share your link", body: "Send it on WhatsApp and start selling." },
] as const;

const SAMPLE_MOOD = [
  { img: "/marketing/fashion.jpg", label: "Fashion" },
  { img: "/marketing/bakery.jpg", label: "Food & bakery" },
  { img: "/marketing/beauty.jpg", label: "Beauty" },
] as const;

function LandingError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : "Something unexpected happened.";
  return (
    <MarketingShell>
      <div className="mx-auto max-w-6xl px-5 py-16">
        <h1 className="text-3xl font-semibold">Discover something you love</h1>
        <p className="mt-3 text-sm text-destructive">{message}</p>
        <Button asChild className="mt-6 rounded-full">
          <Link to="/auth" search={{ mode: "signup" }}>
            Start your store
          </Link>
        </Button>
      </div>
    </MarketingShell>
  );
}

function HeroVisual({ shops }: { shops: ReturnType<typeof featuredPublishedShops> }) {
  const featured = shops.slice(0, 3);
  if (featured.length > 0) {
    return (
      <div className="relative grid grid-cols-2 gap-4">
        {featured.map((shop, index) => (
          <a
            key={shop.slug}
            href={storePublicUrl(shop.slug)}
            className={`group overflow-hidden rounded-3xl border border-border bg-card shadow-soft ${index === 0 ? "col-span-2" : ""}`}
          >
            <div className="flex items-center justify-between px-4 py-2.5 text-xs text-muted-foreground">
              <span className="truncate font-semibold text-foreground">{shop.storeName}</span>
              <span className="shrink-0">Published shop</span>
            </div>
            {shop.logoUrl ? (
              <img
                src={shop.logoUrl}
                alt=""
                className={`w-full object-cover transition-transform duration-700 group-hover:scale-105 ${index === 0 ? "aspect-[2/1]" : "aspect-[4/3]"}`}
              />
            ) : (
              <div className={`w-full bg-muted ${index === 0 ? "aspect-[2/1]" : "aspect-[4/3]"}`} />
            )}
          </a>
        ))}
      </div>
    );
  }

  return (
    <div className="relative grid grid-cols-2 gap-4">
      {SAMPLE_MOOD.map((sample, index) => (
        <Link
          key={sample.label}
          to="/templates"
          className={`group overflow-hidden rounded-3xl border border-border bg-card shadow-soft ${index === 0 ? "col-span-2" : ""}`}
        >
          <div className="flex items-center justify-between px-4 py-2.5 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Sample layout</span>
            <span className="shrink-0">{sample.label}</span>
          </div>
          <img
            src={sample.img}
            alt=""
            className={`w-full object-cover transition-transform duration-700 group-hover:scale-105 ${index === 0 ? "aspect-[2/1]" : "aspect-[4/3]"}`}
          />
        </Link>
      ))}
    </div>
  );
}

function Landing() {
  const { market, fx, marketing } = Route.useLoaderData();
  const heroTitle =
    marketing.heroTitle?.trim() || "Run your business. Sell online. All in one place.";
  const heroSubtitle =
    marketing.heroSubtitle?.trim() ||
    "Manage inventory, sales, customers, invoices and expenses, then create a branded online shop to sell directly to your customers.";
  const featuredShops = featuredPublishedShops(market.shops);
  const zigMonthly = planAmountZig(PLAN_MONTHLY_USD.pro, fx);
  const shopHostExample = `yourbrand.${BRAND.domain}`;

  return (
    <MarketingShell>
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-12 md:grid-cols-2 md:pt-20">
        <div className="rise">
          <p className="mb-5 inline-block rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground">
            Karibu · Mauya · Welcome home
          </p>
          <h1 className="text-5xl leading-[1.05] md:text-6xl">{heroTitle}</h1>
          <p className="mt-6 max-w-lg text-lg text-muted-foreground">{heroSubtitle}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/stores"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-7 py-4 font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
            >
              <ShoppingBag className="size-4" aria-hidden="true" /> Browse stores
            </Link>
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="inline-flex items-center gap-2 rounded-full border-2 border-foreground/15 px-7 py-4 font-semibold transition-colors hover:border-foreground/40"
            >
              Start your store <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
        <HeroVisual shops={featuredShops} />
      </section>

      <section className="bg-secondary py-20">
        <div className="mx-auto grid max-w-6xl gap-6 px-5 md:grid-cols-2">
          <div className="rounded-[2rem] bg-card p-8 md:p-10">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">
              For shoppers
            </p>
            <h2 className="mt-3 text-4xl">Here to find something?</h2>
            <p className="mt-4 text-muted-foreground">
              Wander through independent stores, browse their products and order directly from the
              people who made them.
            </p>
            <div className="mt-8">
              <PublishedShopGrid shops={featuredShops.slice(0, 3)} />
            </div>
            <Link
              to="/stores"
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3.5 font-semibold text-background"
            >
              Explore stores <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="rounded-[2rem] bg-ink p-8 text-sand md:p-10">
            <p className="text-sm font-semibold uppercase tracking-widest text-accent">
              For store owners
            </p>
            <h2 className="mt-3 text-4xl text-background">Ready to open your own shop?</h2>
            <p className="mt-4 text-sand/80">
              Build your own branded website, add products, manage orders and share one simple
              address with your customers.
            </p>
            <div className="mt-6 rounded-2xl border border-sand/20 p-5">
              <p className="text-sm text-sand/60">Your address could be</p>
              <p className="mt-1 font-display text-2xl text-background">
                <span className="text-accent">yourbrand</span>.{BRAND.domain}
              </p>
            </div>
            <ul className="mt-6 space-y-2 text-sm text-sand/90">
              {[
                "Free to build and preview",
                "Pay only when you launch",
                "Your brand, your website",
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <Check className="size-4 shrink-0 text-accent" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3.5 font-semibold text-primary-foreground"
            >
              Build my store <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="text-4xl md:text-5xl">Opening a store takes five small steps.</h2>
        <div className="mt-10 grid gap-3 md:grid-cols-5">
          {SETUP_STEPS.map((step, index) => (
            <div key={step.title} className="rounded-2xl bg-card p-5 shadow-soft">
              <span className="tabular-nums text-sm text-muted-foreground">0{index + 1}</span>
              <step.icon
                className="my-4 size-8 text-primary"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <p className="font-display text-xl">{step.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="max-w-lg text-4xl md:text-5xl">
            A storefront that feels like <em>you</em>.
          </h2>
          <Link to="/templates" className="font-semibold text-primary hover:underline">
            Browse all storefront designs →
          </Link>
        </div>
        <div className="mt-10 flex snap-x gap-5 overflow-x-auto pb-4">
          {STORE_TEMPLATES.slice(0, 6).map((template) => (
            <Link key={template.id} to="/templates" className="group w-64 shrink-0 snap-start">
              <div className="overflow-hidden rounded-2xl border border-border shadow-soft">
                <TemplatePreview
                  template={template}
                  className="aspect-[3/4] h-auto w-full rounded-none border-0"
                />
              </div>
              <p className="mt-3 font-display text-xl">{template.name}</p>
              <p className="text-sm text-muted-foreground">{template.bestFor}</p>
              <p className="text-xs text-muted-foreground">{template.sampleLabel}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-4xl md:text-5xl">Live shops</h2>
            <p className="mt-2 max-w-xl text-muted-foreground">
              Published merchants from the database — never placeholder businesses pretending to be
              real.
            </p>
          </div>
          <Link to="/stores" className="font-semibold text-primary hover:underline">
            See all
          </Link>
        </div>
        <div className="mt-8">
          <PublishedShopGrid shops={featuredShops} />
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 pb-24 text-center">
        <h2 className="text-4xl md:text-5xl">Free to build. One simple price to launch.</h2>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <p className="rounded-2xl border border-border bg-card px-8 py-6 font-display text-5xl tabular-nums text-primary shadow-soft">
            {formatMoney(PLAN_MONTHLY_USD.pro, "USD")}
            <span className="text-xl text-muted-foreground"> / month</span>
          </p>
          <span className="font-display text-2xl text-muted-foreground">or</span>
          <p className="rounded-2xl border border-border bg-card px-8 py-6 font-display text-5xl tabular-nums text-primary shadow-soft">
            {zigMonthly != null ? formatMoney(zigMonthly, "ZWG") : "ZiG 210"}
            <span className="text-xl text-muted-foreground"> / month</span>
          </p>
        </div>
        <p className="mx-auto mt-6 max-w-md text-muted-foreground">
          Create your store, add products and preview everything for free. You only pay when you are
          ready to publish — two fixed prices, not a hidden conversion rate.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className="rounded-full bg-primary px-8 py-4 font-semibold text-primary-foreground"
          >
            Start your store
          </Link>
          <Link
            to="/pricing"
            className="rounded-full border-2 border-foreground/15 px-8 py-4 font-semibold hover:border-foreground/40"
          >
            See pricing details
          </Link>
        </div>
        <p className="mt-10 text-sm text-muted-foreground">
          Example shop address: {shopHostExample} · Product prices in each store are set by that
          seller.
        </p>
      </section>
    </MarketingShell>
  );
}
