import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Building2,
  CreditCard,
  LayoutDashboard,
  Megaphone,
  Package,
  Plug,
  ScrollText,
  Settings2,
  Store,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

const NAV: {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
}[] = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/admin/businesses", label: "Businesses", icon: Building2 },
  { to: "/admin/stores", label: "Storefronts", icon: Store },
  { to: "/admin/orders", label: "Shop orders", icon: Package },
  { to: "/admin/communications", label: "Email outbox", icon: Megaphone },
  { to: "/admin/billing", label: "Billing & FX", icon: CreditCard },
  { to: "/admin/integrations", label: "Integrations", icon: Plug },
  { to: "/admin/personalize", label: "Personalize", icon: Megaphone },
  { to: "/admin/health", label: "Ops health", icon: Settings2 },
  { to: "/admin/audit", label: "Audit log", icon: ScrollText },
  { to: "/admin/system", label: "System", icon: Settings2 },
];

export function AdminShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen bg-background">
      <div className="flex min-h-screen">
        <aside className="hidden w-56 shrink-0 border-r border-border bg-sidebar lg:block">
          <div className="border-b border-sidebar-border px-4 py-4">
            <Logo to="/admin" className="[&_img]:ml-0 [&_img]:h-9 [&_img]:my-0" />
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Platform admin
            </p>
          </div>
          <nav className="space-y-0.5 p-2" aria-label="Platform admin">
            {NAV.map((item) => {
              const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/60",
                  )}
                >
                  <item.icon className="size-4 shrink-0" aria-hidden />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto border-t border-sidebar-border p-3 text-xs text-muted-foreground">
            <Link to="/dashboard" className="font-medium text-primary hover:underline">
              Back to merchant app
            </Link>
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          <header className="border-b border-border px-4 py-4 lg:px-8">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground lg:hidden">
              Kwetuu platform admin
            </p>
            <h1 className="text-xl font-bold tracking-tight">{title}</h1>
          </header>
          <main className="space-y-6 p-4 lg:p-8">{children}</main>
        </div>
      </div>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 gap-1 border-t border-border bg-background/95 p-2 backdrop-blur lg:hidden"
        aria-label="Platform admin mobile"
      >
        {NAV.slice(0, 4).map((item) => {
          const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-md py-1 text-[10px] font-medium",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <item.icon className="size-5" aria-hidden />
              {item.label.split(" ")[0]}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
