import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Logo } from "@/components/logo";
import { BRAND } from "@/lib/brand";
import { savedCartCount } from "@/lib/storefront/cart-registry";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/stores" as const, label: "Browse stores" },
  { to: "/market" as const, label: "Search products", search: { q: "", category: "" } as const },
  { to: "/market/carts" as const, label: "Cart", cart: true as const },
  { to: "/auth" as const, label: "Account", search: { mode: "signin" as const } },
] as const;

export function CustomerShoppingShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const [cartItems, setCartItems] = useState(0);

  useEffect(() => {
    const refresh = () => setCartItems(savedCartCount());
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  return (
    <div className={cn("min-h-screen bg-background", className)}>
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Logo to="/" />
          <nav className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-sm">
            {NAV.map((item) => {
              if ("cart" in item) {
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                    activeProps={{ className: "font-semibold text-foreground" }}
                  >
                    {item.label}
                    {cartItems > 0 ? (
                      <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">
                        {cartItems}
                      </span>
                    ) : null}
                  </Link>
                );
              }
              if ("search" in item) {
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    search={item.search}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                    activeProps={{ className: "font-semibold text-foreground" }}
                  >
                    {item.label}
                  </Link>
                );
              }
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                  activeProps={{ className: "font-semibold text-foreground" }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      <footer className="border-t py-8">
        <div className="mx-auto max-w-6xl px-4 text-center text-xs text-muted-foreground">
          {BRAND.name} · Each checkout stays with one shop ·{" "}
          <Link to="/pricing" className="underline">
            Open your own store
          </Link>
        </div>
      </footer>
    </div>
  );
}
