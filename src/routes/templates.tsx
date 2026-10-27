import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing-shell";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";
import { STORE_TEMPLATES } from "@/lib/storefront/templates";

export const Route = createFileRoute("/templates")({
  head: () => ({
    meta: [
      { title: `Storefront templates | ${BRAND.name}` },
      {
        name: "description",
        content:
          "Ten live layouts that share your real catalogue. Changing a template does not duplicate products.",
      },
    ],
  }),
  component: TemplatesPage,
});

function TemplatesPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-6xl px-4 py-16">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Templates</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          These are the layouts your shoppers see. They are not ten separate apps. Products, prices,
          and stock stay on your business when you switch.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {STORE_TEMPLATES.map((template) => (
            <article key={template.id} className="surface p-5">
              <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
                {template.bestFor}
              </p>
              <h2 className="mt-2 text-lg font-semibold">{template.name}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{template.description}</p>
              <p className="mt-3 text-xs text-muted-foreground">
                Layout {template.layout} · {template.fontFamily} · {template.sampleLabel}
              </p>
            </article>
          ))}
        </div>
        <Button asChild className="mt-10">
          <Link to="/auth" search={{ mode: "signup" }}>
            Choose one after you sign up
          </Link>
        </Button>
      </div>
    </MarketingShell>
  );
}
