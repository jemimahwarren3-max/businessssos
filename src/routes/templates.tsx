import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { MarketingShell } from "@/components/marketing-shell";
import { TemplatePreview } from "@/components/storefront/template-preview";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";
import { STORE_TEMPLATES } from "@/lib/storefront/templates";

export const Route = createFileRoute("/templates")({
  head: () => ({
    meta: [
      { title: `Store designs | ${BRAND.name}` },
      {
        name: "description",
        content:
          "Explore ten storefront layouts for different kinds of businesses. Visual concepts only — your shop uses your real catalogue, prices, stock and checkout.",
      },
      { property: "og:title", content: `Store designs | ${BRAND.name}` },
      {
        property: "og:description",
        content: "Ten storefront design concepts powered by one shared commerce engine.",
      },
    ],
  }),
  component: TemplatesPage,
});

function TemplatesPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-6xl px-5 py-12 sm:py-16">
        <p className="text-sm font-semibold text-primary">Storefront design concepts</p>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
          Find a look for your shop
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
          Explore ten layouts for different kinds of businesses. These are visual concepts, not
          sample products. Your shop uses your real catalogue, prices, stock and checkout.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STORE_TEMPLATES.map((template) => (
            <article
              key={template.id}
              className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft"
              data-template-card={template.id}
            >
              <TemplatePreview
                template={template}
                className="h-44 rounded-none border-0 border-b"
              />
              <div className="p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {template.bestFor}
                </p>
                <h2 className="mt-2 font-display text-xl font-semibold">{template.name}</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">{template.description}</p>
                <p className="mt-3 text-xs text-muted-foreground">{template.sampleLabel}</p>
              </div>
            </article>
          ))}
        </div>
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Button asChild className="gap-2 rounded-full">
            <Link to="/auth" search={{ mode: "signup" }}>
              Open your shop <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="ghost" className="rounded-full">
            <Link to="/">Back to home</Link>
          </Button>
        </div>
      </div>
    </MarketingShell>
  );
}
