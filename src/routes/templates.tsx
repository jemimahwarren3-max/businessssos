import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { STORE_TEMPLATES, type StoreTemplate } from "@/lib/storefront/templates";

export const Route = createFileRoute("/templates")({
  head: () => ({
    meta: [
      { title: "Shop designs | BusinessOS AI" },
      {
        name: "description",
        content: "Explore ten storefront design concepts for shops powered by BusinessOS.",
      },
    ],
  }),
  component: TemplatesPage,
});

function TemplatePreview({ template }: { template: StoreTemplate }) {
  const rows =
    template.layout === "menu" || template.layout === "wholesale" || template.layout === "services";
  const columns =
    template.layout === "dense"
      ? "grid-cols-4"
      : template.layout === "editorial" || template.layout === "luxury"
        ? "grid-cols-2"
        : "grid-cols-3";

  return (
    <div
      className="h-44 overflow-hidden rounded-t-lg border-b bg-white p-3"
      style={{ fontFamily: `"${template.fontFamily}", sans-serif` }}
      aria-hidden="true"
    >
      <div className="flex items-center justify-between gap-2 border-b border-neutral-100 pb-2">
        <span
          className="h-2 w-16 rounded-full"
          style={{ backgroundColor: template.defaultAccent }}
        />
        <span className="h-1.5 w-8 rounded-full bg-neutral-200" />
      </div>
      <div className="mt-3">
        <div
          className="h-7 rounded"
          style={{
            background:
              template.layout === "showcase"
                ? `linear-gradient(110deg, ${template.defaultAccent}40, ${template.defaultAccent}10)`
                : "transparent",
          }}
        >
          <span className="block h-2 w-2/3 rounded-full bg-neutral-200" />
          <span className="mt-1.5 block h-1.5 w-1/2 rounded-full bg-neutral-100" />
        </div>
        <div className={rows ? "mt-2 space-y-1.5" : `mt-2 grid ${columns} gap-1.5`}>
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className={
                rows
                  ? "flex items-center gap-2 rounded border border-neutral-100 p-1.5"
                  : "overflow-hidden rounded border border-neutral-100 p-1"
              }
            >
              <span
                className={rows ? "size-6 shrink-0 rounded-sm" : "block aspect-square rounded-sm"}
                style={{ backgroundColor: `${template.defaultAccent}${item === 1 ? "30" : "18"}` }}
              />
              {rows ? (
                <span className="flex-1">
                  <span className="block h-1.5 w-4/5 rounded-full bg-neutral-200" />
                  <span
                    className="mt-1 block h-1 w-2/5 rounded-full"
                    style={{ backgroundColor: `${template.defaultAccent}60` }}
                  />
                </span>
              ) : (
                <span className="mt-1 block h-1 w-2/3 rounded-full bg-neutral-200" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TemplatesPage() {
  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <Logo to="/" />
          <Button asChild variant="outline" size="sm">
            <Link to="/staff-login">Sign in</Link>
          </Button>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
        <p className="text-sm font-semibold text-primary">Storefront design concepts</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
          Find a look for your shop
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Explore ten layouts for different kinds of businesses. These are visual concepts, not
          sample products. Your shop uses your real catalogue, prices, stock and checkout.
        </p>
        <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STORE_TEMPLATES.map((template) => (
            <article
              key={template.id}
              className="surface overflow-hidden"
              data-template-card={template.id}
            >
              <TemplatePreview template={template} />
              <div className="p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {template.bestFor}
                </p>
                <h2 className="mt-2 text-lg font-semibold">{template.name}</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">{template.description}</p>
                <p className="mt-3 text-xs text-muted-foreground">{template.sampleLabel}</p>
              </div>
            </article>
          ))}
        </div>
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Button asChild className="gap-2">
            <Link to="/auth" search={{ mode: "signup" }}>
              Open your shop <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link to="/">Back to home</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
