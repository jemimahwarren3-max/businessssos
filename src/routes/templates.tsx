import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { MarketingShell } from "@/components/marketing-shell";
import { TemplatePreview } from "@/components/storefront/template-preview";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";
import { STORE_TEMPLATES, TEMPLATE_CATEGORIES } from "@/lib/storefront/templates";

export const Route = createFileRoute("/templates")({
  head: () => ({
    meta: [
      { title: `Store designs | ${BRAND.name}` },
      {
        name: "description",
        content:
          "Explore 60 storefront designs across ten retail categories. Your shop uses your real catalogue, prices, stock and checkout.",
      },
      { property: "og:title", content: `Store designs | ${BRAND.name}` },
      {
        property: "og:description",
        content: "Sixty storefront design concepts powered by one shared commerce engine.",
      },
    ],
  }),
  component: TemplatesPage,
});

function TemplatesPage() {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const search = query.trim().toLowerCase();
  const templates = STORE_TEMPLATES.filter((template) => {
    const matchesCategory = categoryId === "all" || template.category === categoryId;
    const matchesSearch =
      !search ||
      `${template.name} ${template.categoryName} ${template.description} ${template.bestFor}`
        .toLowerCase()
        .includes(search);
    return matchesCategory && matchesSearch;
  });

  return (
    <MarketingShell>
      <div className="mx-auto max-w-6xl px-5 py-12 sm:py-16">
        <p className="text-sm font-semibold text-primary">Storefront design concepts</p>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
          Find a look for your shop
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
          Browse 60 distinct directions across ten retail categories. Your shop uses its real
          catalogue, prices, stock and checkout with one shared commerce engine.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Search designs</span>
            <input
              className="h-10 w-full rounded-md border border-border bg-background px-3"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by style or product type"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Category</span>
            <select
              className="h-10 w-full rounded-md border border-border bg-background px-3"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              <option value="all">All categories (60 designs)</option>
              {TEMPLATE_CATEGORIES.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name} (6 designs)
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-4 text-sm text-muted-foreground" aria-live="polite">
          Showing {templates.length} of {STORE_TEMPLATES.length} designs.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
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
                  {template.categoryName}
                </p>
                <h2 className="mt-2 font-display text-xl font-semibold">{template.name}</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">{template.description}</p>
                <p className="mt-2 text-xs text-muted-foreground">Best for {template.bestFor}</p>
                <p className="mt-3 text-xs text-muted-foreground">{template.sampleLabel}</p>
              </div>
            </article>
          ))}
          {templates.length === 0 ? (
            <p className="rounded-xl border border-dashed p-8 text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">
              No designs match that search. Try another phrase or category.
            </p>
          ) : null}
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
