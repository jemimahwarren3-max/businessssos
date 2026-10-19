import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Boxes,
  Check,
  FileText,
  Lock,
  ReceiptText,
  ShieldCheck,
  Sparkle,
  Users,
  Wallet,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PLAN_MONTHLY_USD } from "@/lib/billing-plans";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BusinessOS AI: Run your business, not your spreadsheets" },
      {
        name: "description",
        content:
          "Inventory, sales, invoices, expenses and intelligent business insights in one simple platform built for small businesses.",
      },
      {
        property: "og:title",
        content: "BusinessOS AI: Run your business, not your spreadsheets",
      },
      {
        property: "og:description",
        content:
          "One simple platform for inventory, sales, invoices, customers, expenses and business insights.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: Boxes,
    title: "Inventory that stays honest",
    body: "Every sale, return and adjustment writes a stock movement, so your numbers never drift.",
  },
  {
    icon: ReceiptText,
    title: "Sell in seconds",
    body: "A fast counter screen with search, barcode input and any payment method your customers use.",
  },
  {
    icon: FileText,
    title: "Invoices and quotes",
    body: "Send a quote, get it accepted, turn it into an invoice. No retyping, no spreadsheets.",
  },
  {
    icon: Users,
    title: "Know your customers",
    body: "See who owes you, what they buy and how much they've spent with you overall.",
  },
  {
    icon: Wallet,
    title: "Money in, money out",
    body: "Record expenses and payments with exact amounts. Profit is calculated, not guessed.",
  },
  {
    icon: BarChart3,
    title: "Reports in plain language",
    body: '"Customers who owe you" instead of "accounts receivable." Business reporting without the jargon.',
  },
];

const plans = [
  {
    name: "Founding Beta",
    price: "$0",
    note: `Free while we build with our founding users, $${PLAN_MONTHLY_USD.pro}/mo after the beta, with clear notice before anything changes`,
    items: [
      "Unlimited products, sales & invoices",
      "Unlimited users",
      "Customers & suppliers",
      "Business Health score & AI Assistant",
      "Advanced inventory & profit analysis",
      "PDF exports & custom invoice branding",
    ],
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3.5 sm:flex sm:justify-between">
          <Logo to="/" />
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <Link
              className="transition-colors hover:text-foreground"
              to="/market"
              search={{ q: "", category: "" }}
            >
              Shops
            </Link>
            <a className="transition-colors hover:text-foreground" href="#features">
              Features
            </a>
            <a className="transition-colors hover:text-foreground" href="#how">
              How it works
            </a>
            <a className="transition-colors hover:text-foreground" href="#pricing">
              Pricing
            </a>
            <a className="transition-colors hover:text-foreground" href="#security">
              Security
            </a>
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/staff-login">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth" search={{ mode: "signup" }}>
                Start free
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="grid-backdrop pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-16 sm:pt-24">
          <Badge variant="secondary" className="mb-5 gap-1.5 rounded-full px-3 py-1 font-medium">
            <Sparkle className="size-3.5 text-primary" aria-hidden="true" />
            Built for shops, not accountants
          </Badge>
          <h1 className="max-w-3xl text-4xl font-extrabold leading-[1.08] tracking-tight text-foreground sm:text-6xl">
            Run your business. <span className="brand-gradient-text">Not your spreadsheets.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Inventory, sales, invoices, expenses and intelligent business insights in one simple
            platform. Everything is connected, a sale updates your stock, your customer balance and
            your profit, automatically.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="gap-2">
              <Link to="/auth" search={{ mode: "signup" }}>
                Start free <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/market" search={{ q: "", category: "" }}>
                Browse shops
              </Link>
            </Button>
          </div>
          <p className="mt-4 text-[13px] text-muted-foreground">
            Free during our beta · No credit card needed · Your data stays yours
          </p>

          <div className="surface mt-14 overflow-hidden p-2 shadow-pop">
            <div className="rounded-[10px] bg-muted/40 p-4 sm:p-6">
              <div className="grid gap-3 sm:grid-cols-4">
                {[
                  { label: "Today's sales", value: "$842.50", change: "+12.4%" },
                  { label: "Today's profit", value: "$241.20", change: "+8.1%" },
                  { label: "Customers owing", value: "$436.00", change: "7 customers" },
                  { label: "Low stock", value: "8 products", change: "3 urgent" },
                ].map((card) => (
                  <div key={card.label} className="surface p-4">
                    <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
                      {card.label}
                    </p>
                    <p className="mt-2 text-2xl font-bold tracking-tight">{card.value}</p>
                    <p className="mt-1 text-[13px] text-muted-foreground">{card.change}</p>
                  </div>
                ))}
              </div>
              <div className="surface mt-3 flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                <div className="flex items-center gap-4">
                  <div className="grid size-16 shrink-0 place-items-center rounded-full border-4 border-success/30 text-xl font-bold text-success">
                    84
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">Business Health · Healthy</p>
                    <p className="text-[13px] text-muted-foreground">
                      Calculated from your real sales, stock and invoice data.
                    </p>
                  </div>
                </div>
                <ul className="grid flex-1 gap-1.5 text-[13px] text-muted-foreground sm:grid-cols-2">
                  <li>✓ Revenue increased 12%</li>
                  <li>✓ Inventory is stable</li>
                  <li>⚠ 3 products running low</li>
                  <li>⚠ 2 invoices overdue</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Most business software gets in the way
            </h2>
            <ul className="mt-5 space-y-3 text-[15px] text-muted-foreground">
              <li>
                Stock counts live in a notebook, sales live in a phone, invoices live in Word.
              </li>
              <li>Accounting tools ask for terminology nobody in the shop uses.</li>
              <li>By the time the numbers are added up, the month is already over.</li>
            </ul>
          </div>
          <div className="surface p-6">
            <h3 className="text-lg font-semibold">BusinessOS connects it all</h3>
            <p className="mt-2 text-sm text-muted-foreground">One flow, one source of truth:</p>
            <div className="mt-4 flex flex-wrap gap-2 text-[13px] font-medium">
              {[
                "Product",
                "Inventory",
                "Sale",
                "Customer",
                "Invoice",
                "Payment",
                "Profit",
                "Insight",
              ].map((step) => (
                <span
                  key={step}
                  className="rounded-lg bg-accent px-2.5 py-1.5 text-accent-foreground"
                >
                  {step}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Everything a small business actually needs
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="surface p-5 transition-shadow hover:shadow-raised">
              <feature.icon className="size-5 text-primary" aria-hidden="true" />
              <h3 className="mt-3 text-base font-semibold">{feature.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Up and running in minutes</h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-4">
          {[
            { t: "Create your business", b: "Name, type and currency. That's it." },
            { t: "Add your products", b: "Prices, stock and low-stock levels." },
            { t: "Start selling", b: "Record sales and stock updates itself." },
            { t: "See what it means", b: "Profit, health score and what to fix next." },
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

      <section id="pricing" className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Free during our beta</h2>
        <p className="mt-2 max-w-lg text-sm text-muted-foreground">
          BusinessOS is currently free while we build with our founding users. Pricing may be
          introduced later, we'll give you clear notice before anything changes.
        </p>
        <div className="mt-8 grid gap-4 sm:max-w-xl">
          {plans.map((plan) => (
            <div key={plan.name} className="surface relative border-primary p-6 shadow-raised">
              <Badge className="absolute -top-2.5 left-6">Founding user</Badge>
              <h3 className="text-base font-semibold">{plan.name}</h3>
              <p className="mt-2 text-3xl font-bold tracking-tight">
                {plan.price}
                <span className="text-sm font-medium text-muted-foreground">/month for now</span>
              </p>
              <p className="mt-1 text-[13px] text-muted-foreground">{plan.note}</p>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                {plan.items.map((item) => (
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
          ))}
        </div>
      </section>

      <section id="security" className="mx-auto max-w-6xl px-4 py-14">
        <div className="surface p-6 sm:p-10">
          <ShieldCheck className="size-6 text-primary" aria-hidden="true" />
          <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
            Your business data belongs to you
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Security is part of the architecture, not a feature we added later. We don't claim to be
            "100% secure", no one can. Here's exactly what we do.
          </p>
          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: Lock, t: "Encrypted connections", b: "All traffic runs over HTTPS." },
              {
                icon: BadgeCheck,
                t: "Secure sign-in",
                b: "Email verification and password reset built in.",
              },
              {
                icon: ShieldCheck,
                t: "Business-level isolation",
                b: "Database rules block access to any business you're not a member of.",
              },
              {
                icon: Users,
                t: "Role-based permissions",
                b: "Owner, admin, manager, cashier and accountant, enforced on the server.",
              },
              {
                icon: FileText,
                t: "Audit logs",
                b: "Sensitive actions are recorded and can't be edited by app users.",
              },
              {
                icon: Wallet,
                t: "Protected payments",
                b: "Subscription state is verified with the payment provider, never trusted from the browser.",
              },
            ].map((item) => (
              <div key={item.t} className="rounded-xl border border-border bg-muted/40 p-4">
                <item.icon className="size-4.5 text-primary" aria-hidden="true" />
                <h3 className="mt-2 text-sm font-semibold">{item.t}</h3>
                <p className="mt-1 text-[13px] text-muted-foreground">{item.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-14">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Questions</h2>
        <Accordion type="single" collapsible className="mt-6">
          <AccordionItem value="q1">
            <AccordionTrigger>Do I need to be good with computers?</AccordionTrigger>
            <AccordionContent>
              No. If you can use a phone, you can use BusinessOS. We avoid accounting jargon.
              You'll see "customers who owe you" instead of "accounts receivable".
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="q2">
            <AccordionTrigger>Does it need AI to work?</AccordionTrigger>
            <AccordionContent>
              No. Every number, report and health score is calculated from your own data with plain
              rules. The AI assistant is an optional layer on top.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="q3">
            <AccordionTrigger>Can other businesses see my data?</AccordionTrigger>
            <AccordionContent>
              No. Every record belongs to one business, and database-level rules reject any request
              from someone who is not a member of that business.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="q4">
            <AccordionTrigger>What happens if I cancel?</AccordionTrigger>
            <AccordionContent>
              Your data isn't deleted. You keep read-only access for a reasonable period so you can
              export what you need.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="rounded-2xl bg-primary-dark px-6 py-12 text-center sm:px-12">
          <h2 className="text-2xl font-bold tracking-tight text-primary-foreground sm:text-3xl">
            Start running your business the simple way
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-primary-foreground/80">
            Set up your shop in a few minutes. Free to start, no card required.
          </p>
          <Button asChild size="lg" variant="secondary" className="mt-7 gap-2">
            <Link to="/auth" search={{ mode: "signup" }}>
              Create your business <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 text-[13px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <Logo />
          <p>© {new Date().getFullYear()} BusinessOS AI. Built for small businesses.</p>
        </div>
      </footer>
    </div>
  );
}
