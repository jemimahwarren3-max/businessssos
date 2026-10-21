import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Logo } from "@/components/logo";
import { BRAND } from "@/lib/brand";

const NAV = [
  { to: "/stores" as const, label: "Browse stores" },
  { to: "/templates" as const, label: "Store designs" },
  { to: "/pricing" as const, label: "Pricing" },
  { to: "/faq" as const, label: "FAQ" },
] as const;

export function MarketingShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="marketplace-theme min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-[4.25rem] max-w-6xl items-center justify-between gap-4 px-5">
          <Logo to="/" />
          <nav className="hidden items-center gap-8 text-[15px] md:flex">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="text-muted-foreground transition-colors hover:text-foreground"
                activeProps={{ className: "font-semibold text-foreground" }}
              >
                {item.label}
              </Link>
            ))}
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="rounded-full bg-primary px-5 py-2.5 font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
            >
              Start a store
            </Link>
          </nav>
          <button
            type="button"
            className="p-2 md:hidden"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
        {menuOpen ? (
          <div className="border-t px-5 pb-6 pt-3 md:hidden">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMenuOpen(false)}
                className="block border-b border-border py-4 text-lg"
              >
                {item.label}
              </Link>
            ))}
            <Link
              to="/auth"
              search={{ mode: "signin" }}
              onClick={() => setMenuOpen(false)}
              className="block py-3 text-muted-foreground"
            >
              Sign in
            </Link>
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              onClick={() => setMenuOpen(false)}
              className="mt-4 block rounded-full bg-primary py-3.5 text-center font-semibold text-primary-foreground"
            >
              Start a store
            </Link>
          </div>
        ) : null}
      </header>
      <main>{children}</main>
      <footer className="mt-24 bg-ink text-sand">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-4">
          <div className="md:col-span-2">
            <p className="font-display text-3xl text-background">{BRAND.name}</p>
            <p className="mt-3 max-w-sm text-sand/80">
              &ldquo;Kwetuu&rdquo; means <em>our home</em>. Discover independent shops — or open one
              of your own. Zimbabwe-first, honest about what is live and what is still in preview.
            </p>
          </div>
          <div className="space-y-2 text-sm">
            <p className="font-semibold text-background">Shop</p>
            <Link to="/stores" className="block hover:text-background">
              Browse stores
            </Link>
            <Link to="/features" className="block hover:text-background">
              How shopping works
            </Link>
          </div>
          <div className="space-y-2 text-sm">
            <p className="font-semibold text-background">Sell</p>
            <Link to="/auth" search={{ mode: "signup" }} className="block hover:text-background">
              Start a store
            </Link>
            <Link to="/templates" className="block hover:text-background">
              Store designs
            </Link>
            <Link to="/pricing" className="block hover:text-background">
              Pricing
            </Link>
            <Link to="/about" className="block hover:text-background">
              About
            </Link>
            <Link to="/privacy" className="block hover:text-background">
              Privacy
            </Link>
            <Link to="/terms" className="block hover:text-background">
              Terms
            </Link>
          </div>
        </div>
        <p className="border-t border-sand/15 py-5 text-center text-sm text-sand/60">
          © {new Date().getFullYear()} {BRAND.name} · Shops at your-store.{BRAND.domain}
        </p>
      </footer>
    </div>
  );
}
