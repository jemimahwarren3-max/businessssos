import { type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Boxes,
  ChevronDown,
  FileCheck2,
  FileText,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Receipt,
  Settings,
  ShoppingCart,
  Sparkles,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/sales", label: "Sales", icon: ShoppingCart },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/invoices", label: "Invoices", icon: FileText },
  { to: "/quotes", label: "Quotes", icon: FileCheck2 },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/expenses", label: "Expenses", icon: Receipt },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/assistant", label: "AI Assistant", icon: Sparkles },
] as const;

// Bottom nav stays to four items so it's usable on a small screen —
// Dashboard, Sales, Inventory, Invoices are the highest-frequency actions.
const MOBILE_NAV = [NAV[0], NAV[1], NAV[2], NAV[3]] as const;

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  cashier: "Cashier",
  accountant: "Accountant",
};

export function AppShell({
  children,
  businessName,
  role,
  plan,
  title,
  subtitle,
  actions,
}: {
  children: ReactNode;
  businessName: string;
  role: string;
  plan: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true, search: { mode: "signin" } });
  }

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="px-5 py-4">
          <Logo to="/dashboard" />
        </div>
        <nav className="flex-1 space-y-1 px-3 py-2" aria-label="Main">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/60",
                )}
              >
                <item.icon className="size-4.5 shrink-0" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
          <p className="px-3 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Coming next
          </p>
          {["Suppliers"].map((label) => (
            <span
              key={label}
              className="flex cursor-not-allowed items-center justify-between rounded-lg px-3 py-2 text-sm text-muted-foreground/70"
            >
              {label}
              <span className="text-[10px] uppercase tracking-wide">soon</span>
            </span>
          ))}
        </nav>
        <div className="space-y-1 border-t border-sidebar-border p-3 text-sm">
          <span className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-muted-foreground/70">
            <Settings className="size-4.5" aria-hidden="true" /> Settings
          </span>
          <span className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-muted-foreground/70">
            <HelpCircle className="size-4.5" aria-hidden="true" /> Help
          </span>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent/60"
          >
            <LogOut className="size-4.5" aria-hidden="true" /> Sign out
          </button>
        </div>
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
          <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2 lg:hidden">
              <Logo to="/dashboard" showWord={false} />
              <span className="truncate text-sm font-semibold">{businessName}</span>
            </div>
            <div className="hidden min-w-0 items-center gap-2 lg:flex">
              <span className="truncate text-sm font-semibold">{businessName}</span>
              <Badge variant="secondary" className="shrink-0">
                {ROLE_LABEL[role] ?? role}
              </Badge>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant="outline" className="hidden capitalize sm:inline-flex">
                {plan} plan
              </Badge>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1">
                    Account <ChevronDown className="size-4" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>{ROLE_LABEL[role] ?? role}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={signOut}>
                    <LogOut className="size-4" aria-hidden="true" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 lg:pb-12">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold tracking-tight sm:text-[28px]">{title}</h1>
              {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
            </div>
            {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
          </div>
          <div className="mt-6">{children}</div>
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur lg:hidden"
        aria-label="Primary"
      >
        <div className="grid grid-cols-4">
          {MOBILE_NAV.map((item) => {
            const active = pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <item.icon className="size-5" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
