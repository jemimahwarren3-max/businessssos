import { type ReactNode, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  ChevronDown,
  ClipboardList,
  Download,
  FileCheck2,
  FileText,
  HelpCircle,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  Receipt,
  Settings,
  ShoppingCart,
  Sparkles,
  Truck,
  UserX,
  Users,
  Wand2,
} from "lucide-react";
import { signOutFn } from "@/lib/auth/auth.functions";
import { Logo } from "@/components/logo";
import { QuickEntryDialog } from "@/components/quick-entry-dialog";
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
  { to: "/suppliers", label: "Suppliers", icon: Truck },
  { to: "/purchase-orders", label: "Purchase Orders", icon: ClipboardList },
  { to: "/invoices", label: "Invoices", icon: FileText },
  { to: "/quotes", label: "Quotes", icon: FileCheck2 },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/expenses", label: "Expenses", icon: Receipt },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/insights", label: "Insights", icon: Lightbulb },
  { to: "/assistant", label: "AI Assistant", icon: Sparkles },
] as const;

// Bottom nav stays to four items so it's usable on a small screen —
// Dashboard, Sales, Inventory, Invoices are the highest-frequency actions.
// Looked up by path rather than array index so inserting a new NAV entry
// elsewhere (e.g. Suppliers) can never silently bump one of these out.
const MOBILE_PATHS = ["/dashboard", "/sales", "/inventory", "/invoices"] as const;
const MOBILE_NAV = MOBILE_PATHS.map((to) => NAV.find((item) => item.to === to)!);

export const ROLE_LABEL: Record<string, string> = {
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
  isReadOnly,
  billingEnabled = true,
  title,
  subtitle,
  actions,
}: {
  children: ReactNode;
  businessName: string;
  role: string;
  plan: string;
  isReadOnly?: boolean;
  billingEnabled?: boolean;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const signOutServerFn = useServerFn(signOutFn);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOutServerFn();
    navigate({ to: "/staff-login", replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        Skip to main content
      </a>
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
        </nav>
        <div className="space-y-1 border-t border-sidebar-border p-3 text-sm">
          <Link
            to="/settings/team"
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent/60"
          >
            <Users className="size-4.5" aria-hidden="true" /> Team
          </Link>
          <Link
            to="/settings/billing"
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent/60"
          >
            <Settings className="size-4.5" aria-hidden="true" /> Billing
          </Link>
          <Link
            to="/settings/data"
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent/60"
          >
            <Download className="size-4.5" aria-hidden="true" /> Export data
          </Link>
          <Link
            to="/settings/account"
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent/60"
          >
            <UserX className="size-4.5" aria-hidden="true" /> Account
          </Link>
          <Link
            to="/help"
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent/60"
          >
            <HelpCircle className="size-4.5" aria-hidden="true" /> Help
          </Link>
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
              <Button
                variant="default"
                size="sm"
                className="gap-1.5"
                onClick={() => setQuickAddOpen(true)}
              >
                <Wand2 className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">Quick add</span>
              </Button>
              {billingEnabled ? (
                <Link to="/settings/billing" className="hidden sm:inline-flex">
                  <Badge variant="outline" className="capitalize">
                    {plan} plan
                  </Badge>
                </Link>
              ) : null}
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

        {isReadOnly ? (
          <div className="border-b border-warning/30 bg-warning-soft px-4 py-2.5 text-[13px] text-warning-foreground">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
                Your trial has ended. You can still view everything, but upgrade to keep creating
                and editing.
              </span>
              <Link
                to="/settings/billing"
                className="shrink-0 font-semibold underline underline-offset-2"
              >
                Upgrade now
              </Link>
            </div>
          </div>
        ) : null}

        <main id="main-content" className="mx-auto max-w-6xl px-4 pb-28 pt-6 lg:pb-12">
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

      <QuickEntryDialog open={quickAddOpen} onOpenChange={setQuickAddOpen} />
    </div>
  );
}
