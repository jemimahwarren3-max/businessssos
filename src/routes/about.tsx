import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing-shell";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: `About | ${BRAND.name}` },
      {
        name: "description",
        content: `${BRAND.name} helps small businesses open an online shop and run the till on the same catalogue.`,
      },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">About {BRAND.name}</h1>
        <p className="mt-4 text-muted-foreground">
          {BRAND.name} ({BRAND.domain}) is a merchant operating system with a public shop. It is not
          a Next.js starter and not a second backend. Inventory, orders, and Paynow already live in
          this app.
        </p>
        <p className="mt-4 text-muted-foreground">
          We build for shops that take cash, EcoCash, and collection windows — including businesses
          in Zimbabwe — without pretending InnBucks or custom domains are live until they are.
        </p>
        <Button asChild className="mt-8">
          <Link to="/auth" search={{ mode: "signup" }}>
            Create a shop
          </Link>
        </Button>
      </div>
    </MarketingShell>
  );
}
