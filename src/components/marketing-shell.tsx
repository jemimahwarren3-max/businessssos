import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { BRAND } from "@/lib/brand";

const NAV = [
  { to: "/market" as const, label: "Shops", search: { q: "", category: "" } },
  { to: "/features" as const, label: "Features" },
  { to: "/templates" as const, label: "Templates" },
  { to: "/pricing" as const, label: "Pricing" },
  { to: "/faq" as const, label: "FAQ" },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      {NAV.map((item) =>
        item.to === "/market" ? (
          <Link
            key={item.to}
            className="shrink-0 text-sm text-muted-foreground transition-colors hover:text-foreground"
            to="/market"
            search={item.search}
            onClick={onNavigate}
          >
            {item.label}
          </Link>
        ) : (
          <Link
            key={item.to}
            className="shrink-0 text-sm text-muted-foreground transition-colors hover:text-foreground"
            to={item.to}
            onClick={onNavigate}
          >
            {item.label}
          </Link>
        ),
      )}
    </>
  );
}

export function MarketingShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5">
          <Logo to="/" />
          <nav className="hidden items-center gap-6 lg:flex">
            <NavLinks />
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link to="/auth" search={{ mode: "signin" }}>
                Sign in
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth" search={{ mode: "signup" }}>
                Open a shop
              </Link>
            </Button>
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="lg:hidden" aria-label="Open menu">
                  <Menu className="size-4" aria-hidden="true" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72">
                <SheetHeader>
                  <SheetTitle>{BRAND.name}</SheetTitle>
                </SheetHeader>
                <nav className="mt-8 flex flex-col gap-4">
                  <NavLinks onNavigate={() => setMenuOpen(false)} />
                  <Link
                    className="text-sm font-medium text-foreground"
                    to="/auth"
                    search={{ mode: "signin" }}
                    onClick={() => setMenuOpen(false)}
                  >
                    Sign in
                  </Link>
                </nav>
              </SheetContent>
            </Sheet>
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
