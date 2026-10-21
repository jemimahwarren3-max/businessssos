import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <Logo to="/" />
          <nav className="-mx-4 flex items-center gap-5 overflow-x-auto px-4 text-sm text-muted-foreground lg:mx-0 lg:overflow-visible lg:px-0">
            <Link
              className="shrink-0 transition-colors hover:text-foreground"
              to="/market"
              search={{ q: "", category: "" }}
            >
              Shops
            </Link>
            <Link className="shrink-0 transition-colors hover:text-foreground" to="/features">
              Features
            </Link>
            <Link className="shrink-0 transition-colors hover:text-foreground" to="/templates">
              Templates
            </Link>
            <Link className="shrink-0 transition-colors hover:text-foreground" to="/pricing">
              Pricing
            </Link>
            <Link className="shrink-0 transition-colors hover:text-foreground" to="/faq">
              FAQ
            </Link>
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth" search={{ mode: "signin" }}>
                Sign in
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth" search={{ mode: "signup" }}>
                Open a shop
              </Link>
            </Button>
          </div>
        </div>
      </header>
      {children}
      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 text-[13px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <Logo />
          <nav className="flex flex-wrap gap-4">
            <Link to="/about" className="hover:text-foreground">
              About
            </Link>
            <Link to="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link to="/legal/refunds" className="hover:text-foreground">
              Refunds
            </Link>
            <Link to="/staff-login" className="hover:text-foreground">
              Staff sign-in
            </Link>
          </nav>
          <p>
            © {new Date().getFullYear()} {BRAND.name}. Shops for small businesses, including
            Zimbabwe.
          </p>
        </div>
      </footer>
    </div>
  );
}
