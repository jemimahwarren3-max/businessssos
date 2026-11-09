import { type ReactNode, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Boxes,
  Briefcase,
  CalendarDays,
  ChevronDown,
  Clock,
  ClipboardList,
  CreditCard,
  Download,
  FileCheck2,
  FileText,
  HelpCircle,
  History,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  MapPin,
  Megaphone,
  MoreHorizontal,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  Store,
  Wallet,
  Sparkles,
  Truck,
  UserX,
  Users,
  Wand2,
} from "lucide-react";
import { endImpersonationFn, getPlatformAnnouncementFn } from "@/lib/admin/admin.functions";
import { hasPermission, useWorkspace } from "@/hooks/use-workspace";
import { signOutFn } from "@/lib/auth/auth.functions";
import {
  getNotificationsFn,
  markAllNotificationsReadFn,
  markNotificationReadFn,
} from "@/lib/business.functions";
import { HintTooltip } from "@/components/hint-tooltip";
import { Logo } from "@/components/logo";
import { AppNavigator } from "@/components/app-navigator";
import { QuickAddMenu } from "@/components/quick-add-menu";
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
import { getStorefrontAdminFn } from "@/lib/storefront/storefront.functions";
import { deriveStoreLaunchDisplay } from "@/lib/storefront/launch-status";
import { friendlyDate } from "@/lib/format";
import { clearOfflineCacheOnLogout } from "@/lib/offline/db";
import { HEADER_HINTS, MAIN_NAV_HINTS } from "@/lib/nav-hints";
import { isCommerceModel, navShowsServicesFirst, type CommerceModel } from "@/lib/commerce-model";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/theme-toggle";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission?: string;
  showLaunchBadge?: boolean;
};

function navGroupsFor(model: CommerceModel): { label: string; items: NavItem[] }[] {
  const serviceItems: NavItem[] = [
    { to: "/services", label: "Services", icon: Briefcase, permission: "business.settings" },
    { to: "/bookings", label: "Bookings", icon: CalendarDays, permission: "business.settings" },
  ];
  const stockItems: NavItem[] = [
    {
      to: "/inventory",
      label: "Products & inventory",
      icon: Boxes,
      permission: "inventory.import",
    },
    { to: "/lay-by", label: "Lay-by", icon: Wallet, permission: "sales.create" },
    { to: "/suppliers", label: "Suppliers", icon: Truck, permission: "suppliers.view" },
    {
      to: "/purchase-orders",
      label: "Purchase orders",
      icon: ClipboardList,
      permission: "purchase_orders.create",
    },
  ];
  const businessItems: NavItem[] = navShowsServicesFirst(model)
    ? [
        { to: "/sales", label: "Sales", icon: ShoppingCart, permission: "sales.create" },
        ...serviceItems,
        { to: "/customers", label: "Customers", icon: Users, permission: "customers.create" },
        { to: "/invoices", label: "Invoices", icon: FileText, permission: "invoices.manage" },
        { to: "/quotes", label: "Quotes", icon: FileCheck2, permission: "quotes.manage" },
        { to: "/expenses", label: "Expenses", icon: Receipt, permission: "expenses.create" },
        ...stockItems,
        { to: "/reports", label: "Reports", icon: BarChart3, permission: "reports.financial" },
        { to: "/branches", label: "Branches", icon: MapPin, permission: "business.settings" },
      ]
    : [
        { to: "/sales", label: "Sales", icon: ShoppingCart, permission: "sales.create" },
        {
          to: "/inventory",
          label: "Products & inventory",
          icon: Boxes,
          permission: "inventory.import",
        },
        { to: "/customers", label: "Customers", icon: Users, permission: "customers.create" },
        { to: "/lay-by", label: "Lay-by", icon: Wallet, permission: "sales.create" },
        { to: "/invoices", label: "Invoices", icon: FileText, permission: "invoices.manage" },
        { to: "/quotes", label: "Quotes", icon: FileCheck2, permission: "quotes.manage" },
        { to: "/expenses", label: "Expenses", icon: Receipt, permission: "expenses.create" },
        { to: "/suppliers", label: "Suppliers", icon: Truck, permission: "suppliers.view" },
        {
          to: "/purchase-orders",
          label: "Purchase orders",
          icon: ClipboardList,
          permission: "purchase_orders.create",
        },
        ...serviceItems,
        { to: "/reports", label: "Reports", icon: BarChart3, permission: "reports.financial" },
        { to: "/branches", label: "Branches", icon: MapPin, permission: "business.settings" },
      ];
  return [
    {
      label: "Overview",
      items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
    },
    { label: "Business", items: businessItems },
    {
      label: "Online shop",
      items: [
        {
          to: "/storefront",
          label: "Online Store",
          icon: Store,
          permission: "business.settings",
          showLaunchBadge: true,
        },
        {
          to: "/online-orders",
          label: "Orders",
          icon: Package,
          permission: "orders.manage",
        },
      ],
    },
    {
      label: "Growth & AI",
      items: [
        { to: "/growth", label: "Grow", icon: Megaphone, permission: "reports.financial" },
        { to: "/insights", label: "Insights", icon: Lightbulb, permission: "reports.financial" },
        {
          to: "/assistant",
          label: "AI Briefing",
          icon: Sparkles,
          permission: "ai.use",
        },
      ],
    },
  ];
}

const PRIMARY_NAV_PATHS = ["/dashboard", "/sales", "/inventory", "/online-orders", "/reports"];

function navPermissionAllowed(permission: string, permissions: string[]) {
  if (permissions.includes(permission)) return true;
  if (permission === "inventory.import" && permissions.includes("inventory.view")) return true;
  return false;
}

function visibleNavItems(items: NavItem[], permissions: string[]) {
  return items.filter(
    (item) => !item.permission || navPermissionAllowed(item.permission, permissions),
  );
}

function mobileNavFor(groups: { items: NavItem[] }[], permissions: string[]) {
  const nav = groups.flatMap((group) => group.items);
  return visibleNavItems(
    [
      { to: "/dashboard", label: "Home", icon: LayoutDashboard },
      ...PRIMARY_NAV_PATHS.slice(1).map((to) => nav.find((item) => item.to === to)),
    ].filter((item): item is NavItem => item !== undefined),
    permissions,
  );
}

function MoreNavMenu({
  items,
  activePath,
  launchBadge,
  mobile = false,
}: {
  items: NavItem[];
  activePath: string;
  launchBadge: string | null;
  mobile?: boolean;
}) {
  if (items.length === 0) return null;
  const active = items.some((item) => activePath.startsWith(item.to));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={mobile ? "default" : "sm"}
          aria-label="More navigation"
          className={
            mobile
              ? cn(
                  "flex h-auto min-h-11 w-full flex-col gap-1 rounded-none px-1 py-2.5 text-[11px]",
                  active ? "text-primary" : "text-muted-foreground",
                )
              : "gap-1.5"
          }
        >
          <MoreHorizontal className="size-5" aria-hidden="true" />
          More
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={mobile ? "end" : "start"}
        className="max-h-[70vh] w-60 overflow-y-auto"
      >
        {items.map((item) => (
          <DropdownMenuItem key={item.to} asChild>
            <Link to={item.to} className="flex items-center gap-2">
              <item.icon className="size-4" aria-hidden="true" />
              <span className="min-w-0 flex-1">{item.label}</span>
              {item.showLaunchBadge && launchBadge ? (
                <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                  {launchBadge}
                </Badge>
              ) : null}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const SECONDARY_NAV: NavItem[] = [
  { to: "/expenses", label: "Expenses", icon: Receipt, permission: "expenses.create" },
  { to: "/assistant", label: "AI Briefing", icon: Sparkles, permission: "ai.use" },
  { to: "/storefront", label: "Online Store", icon: Store, permission: "business.settings" },
  { to: "/customers", label: "Customers", icon: Users, permission: "customers.create" },
  { to: "/settings/team", label: "Employees", icon: Users, permission: "users.view" },
  {
    to: "/settings/business",
    label: "Business Settings",
    icon: Briefcase,
    permission: "business.settings",
  },
  {
    to: "/settings/billing",
    label: "Subscription",
    icon: Settings,
    permission: "business.billing",
  },
  { to: "/cash-drawer", label: "Cash drawer", icon: Wallet, permission: "sales.create" },
  { to: "/time-clock", label: "Time clock" as const, icon: Clock, permission: "users.view" },
  {
    to: "/settings/payments",
    label: "Payments",
    icon: CreditCard,
    permission: "business.settings",
  },
  {
    to: "/settings/data",
    label: "Export data",
    icon: Download,
    permission: "business.export_data",
  },
  { to: "/settings/audit-log", label: "Audit log", icon: History, permission: "reports.financial" },
  { to: "/settings/account", label: "Account", icon: UserX },
  { to: "/help", label: "Help", icon: HelpCircle },
];

export const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  cashier: "Cashier",
  accountant: "Accountant",
  stock_assistant: "Stock assistant",
};

const SEVERITY_DOT: Record<string, string> = {
  info: "bg-sky-500",
  success: "bg-success",
  warning: "bg-warning",
  critical: "bg-destructive",
};

function NotificationsBell({ businessId }: { businessId: string | undefined }) {
  const queryClient = useQueryClient();
  const fetchNotifications = useServerFn(getNotificationsFn);
  const markReadFn = useServerFn(markNotificationReadFn);
  const markAllReadFn = useServerFn(markAllNotificationsReadFn);
  const navigate = useNavigate();

  const notifications = useQuery({
    queryKey: ["notifications", businessId],
    enabled: Boolean(businessId),
    queryFn: () => fetchNotifications({ data: { businessId: businessId! } }),
    staleTime: 120_000,
    refetchInterval: 120_000,
  });

  const markReadMutation = useMutation({
    mutationFn: (notificationId: string) => markReadFn({ data: { notificationId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", businessId] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => markAllReadFn({ data: { businessId: businessId! } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", businessId] }),
  });

  const unreadCount = notifications.data?.unreadCount ?? 0;
  const entries = notifications.data?.entries ?? [];

  return (
    <DropdownMenu>
      <HintTooltip hint={HEADER_HINTS.notifications} side="bottom">
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="relative gap-0 px-2">
            <Bell className="size-4.5" aria-hidden="true" />
            <span className="sr-only">Notifications</span>
            {unreadCount > 0 ? (
              <span className="absolute right-1 top-1 flex size-2 rounded-full bg-destructive" />
            ) : null}
          </Button>
        </DropdownMenuTrigger>
      </HintTooltip>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
          <div className="flex items-center gap-2">
            {unreadCount > 0 ? (
              <button
                className="text-xs font-medium text-primary hover:underline"
                onClick={(e) => {
                  e.preventDefault();
                  markAllReadMutation.mutate();
                }}
              >
                Mark all read
              </button>
            ) : null}
            <Link to="/notifications" className="text-xs font-medium text-primary hover:underline">
              See all
            </Link>
          </div>
        </div>
        <DropdownMenuSeparator />
        {entries.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">
            {notifications.isLoading ? "Loading…" : "Nothing yet."}
          </p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {entries.map((n) => (
              <DropdownMenuItem
                key={n.id}
                className="flex items-start gap-2 whitespace-normal py-2"
                onSelect={() => {
                  if (!n.is_read) markReadMutation.mutate(n.id);
                  if (n.link) navigate({ to: n.link });
                }}
              >
                <span
                  className={cn(
                    "mt-1.5 size-1.5 shrink-0 rounded-full",
                    n.is_read ? "bg-transparent" : (SEVERITY_DOT[n.severity] ?? "bg-sky-500"),
                  )}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm", n.is_read ? "text-muted-foreground" : "font-medium")}>
                    {n.title}
                  </p>
                  {n.message ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">{n.message}</p>
                  ) : null}
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {friendlyDate(n.created_at)}
                  </p>
                </div>
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({
  children,
  businessName,
  role,
  plan,
  isReadOnly,
  billingEnabled = true,
  title,
  subtitle,
  subtitleAsTooltip = false,
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
  subtitleAsTooltip?: boolean;
  actions?: ReactNode;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const signOutServerFn = useServerFn(signOutFn);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  // Reuses the ["workspace"] query every page already populates, no extra
  // network request in practice, just reading businessId back out of it.
  const workspace = useWorkspace();
  const endImpersonation = useServerFn(endImpersonationFn);
  const stopImpersonation = useMutation({
    mutationFn: () =>
      endImpersonation({ data: { reason: "Ended support view from merchant banner" } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
      navigate({ to: "/admin/businesses" });
    },
  });
  const isOperateLocked = workspace.data?.isOperateLocked ?? false;
  const businessId = workspace.data?.business.id;
  const rawCommerceModel = workspace.data?.business?.commerce_model;
  const commerceModel: CommerceModel = isCommerceModel(rawCommerceModel)
    ? rawCommerceModel
    : "products";
  const groups = navGroupsFor(commerceModel);
  const permissions = Array.isArray(workspace.data?.permissions) ? workspace.data.permissions : [];
  const mobileNav = mobileNavFor(groups, permissions);
  const moreNav = visibleNavItems(
    [...groups.flatMap((group) => group.items), ...SECONDARY_NAV],
    permissions,
  ).filter(
    (item, index, items) =>
      !PRIMARY_NAV_PATHS.includes(item.to) &&
      (item.to !== "/settings/billing" || billingEnabled) &&
      items.findIndex((candidate) => candidate.to === item.to) === index,
  );
  const canUseQuickAdd = permissions.includes("ai.use");
  const canManageBilling = permissions.includes("business.billing");
  const loadStorefront = useServerFn(getStorefrontAdminFn);
  const storefrontLaunch = useQuery({
    queryKey: ["storefront-launch-nav", businessId],
    enabled: Boolean(businessId) && permissions.includes("business.settings"),
    queryFn: () => loadStorefront({ data: { businessId: businessId! } }),
    staleTime: 90_000,
  });
  const launchBadge =
    storefrontLaunch.data && workspace.data
      ? deriveStoreLaunchDisplay({
          checklist: storefrontLaunch.data.checklist,
          storeStatus: storefrontLaunch.data.store?.status,
          billingEnabled: workspace.data.billingEnabled,
          isOperateLocked,
        }).badge
      : null;
  const loadAnnouncement = useServerFn(getPlatformAnnouncementFn);
  const platformAnnouncement = useQuery({
    queryKey: ["platform-announcement"],
    queryFn: () => loadAnnouncement(),
    staleTime: 120_000,
  });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await clearOfflineCacheOnLogout(workspace.data?.business.id ?? null);
    await signOutServerFn();
    navigate({ to: "/staff-login", replace: true });
  }

  return (
    <TooltipProvider delayDuration={350}>
      <div className="min-h-screen bg-background">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
        >
          Skip to main content
        </a>
        <div>
          <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
            <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2 lg:hidden">
                <Logo to="/dashboard" className="shrink-0 [&_img]:ml-0 [&_img]:h-9 [&_img]:my-0" />
                <span className="truncate text-sm font-semibold">{businessName}</span>
              </div>
              <div className="hidden min-w-0 items-center gap-2 lg:flex">
                <span className="truncate text-sm font-semibold">{businessName}</span>
                <HintTooltip hint={HEADER_HINTS.role} side="bottom">
                  <Badge variant="secondary" className="shrink-0 cursor-default">
                    {ROLE_LABEL[role] ?? role}
                  </Badge>
                </HintTooltip>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <ThemeToggle />
                <HintTooltip hint="Search pages and tools (Ctrl+K)" side="bottom">
                  <Button
                    variant="outline"
                    size="sm"
                    className="hidden gap-1.5 sm:inline-flex"
                    onClick={() => {
                      window.dispatchEvent(
                        new KeyboardEvent("keydown", { key: "k", ctrlKey: true }),
                      );
                    }}
                  >
                    Search
                  </Button>
                </HintTooltip>
                <HintTooltip
                  hint="Step-by-step guide for sales, stock, imports and shortcuts"
                  side="bottom"
                >
                  <Button variant="outline" size="sm" className="gap-1" asChild>
                    <Link to="/help">
                      <HelpCircle className="size-4" aria-hidden="true" />
                      <span className="hidden sm:inline">Help</span>
                    </Link>
                  </Button>
                </HintTooltip>
                {hasPermission(workspace.data, "business.export_data") ? (
                  <HintTooltip hint="Download your data as Excel or JSON" side="bottom">
                    <Button variant="outline" size="sm" className="gap-1" asChild>
                      <Link to="/settings/data">
                        <Download className="size-4" aria-hidden="true" />
                        <span className="hidden sm:inline">Download</span>
                      </Link>
                    </Button>
                  </HintTooltip>
                ) : null}
                {canUseQuickAdd ? (
                  <HintTooltip hint={HEADER_HINTS.quickAdd} side="bottom">
                    <Button
                      variant="default"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => setQuickAddOpen(true)}
                    >
                      <Wand2 className="size-4" aria-hidden="true" />
                      <span className="hidden sm:inline">Quick add</span>
                    </Button>
                  </HintTooltip>
                ) : null}
                <NotificationsBell businessId={workspace.data?.business.id} />
                {billingEnabled && canManageBilling ? (
                  <HintTooltip hint={HEADER_HINTS.plan} side="bottom">
                    <Link to="/settings/billing" className="hidden sm:inline-flex">
                      <Badge variant="outline" className="cursor-default capitalize">
                        {workspace.data?.planStatus === "trialing" ? "Trial" : plan}
                      </Badge>
                    </Link>
                  </HintTooltip>
                ) : null}
                <DropdownMenu>
                  <HintTooltip hint={HEADER_HINTS.account} side="bottom">
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="gap-1">
                        Account <ChevronDown className="size-4" aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                  </HintTooltip>
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
            <nav
              className="mx-auto hidden max-w-6xl items-center gap-1 px-4 pb-2 lg:flex"
              aria-label="Primary desktop navigation"
            >
              {mobileNav.map((item) => {
                const active = pathname.startsWith(item.to);
                const hint = MAIN_NAV_HINTS[item.to] ?? "";
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    title={hint}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors",
                      active
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <item.icon className="size-4 shrink-0" aria-hidden="true" />
                    <span>{item.to === "/dashboard" ? "Home" : item.label}</span>
                  </Link>
                );
              })}
              <MoreNavMenu items={moreNav} activePath={pathname} launchBadge={launchBadge} />
            </nav>
          </header>

          {workspace.data?.isImpersonating ? (
            <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2.5 text-[13px] text-foreground">
              <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-semibold text-destructive">Support view (read-only): </span>
                  viewing {workspace.data.impersonationBusinessName ?? workspace.data.business.name}
                  . Expires{" "}
                  {workspace.data.impersonationExpiresAt
                    ? new Date(workspace.data.impersonationExpiresAt).toLocaleString()
                    : "soon"}
                  .
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={stopImpersonation.isPending}
                  onClick={() => stopImpersonation.mutate()}
                >
                  End support view
                </Button>
              </div>
            </div>
          ) : null}

          {platformAnnouncement.data?.enabled && platformAnnouncement.data.message ? (
            <div className="border-b border-primary/25 bg-primary/10 px-4 py-2.5 text-[13px] text-foreground">
              <div className="mx-auto max-w-6xl">
                <span className="font-medium text-primary">Kwetuu: </span>
                {platformAnnouncement.data.message}
              </div>
            </div>
          ) : null}

          {isReadOnly ? (
            <div className="border-b border-warning/30 bg-warning-soft px-4 py-2.5 text-[13px] text-warning-foreground">
              <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
                  Your trial has ended. You can still view everything, but upgrade to keep creating
                  and editing.
                </span>
                {canManageBilling ? (
                  <Link
                    to="/settings/billing"
                    className="shrink-0 font-semibold underline underline-offset-2"
                  >
                    Upgrade now
                  </Link>
                ) : null}
              </div>
            </div>
          ) : isOperateLocked && billingEnabled ? (
            <div className="border-b border-primary/20 bg-primary/5 px-4 py-2.5 text-[13px] text-foreground">
              <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
                <span>
                  Setup is free. Pay for Pro when you are ready to publish your shop or use the
                  sales counter.
                </span>
                {canManageBilling ? (
                  <Link
                    to="/settings/billing"
                    className="shrink-0 font-semibold text-primary underline underline-offset-2"
                  >
                    Go to billing
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}

          <main id="main-content" className="mx-auto max-w-6xl px-4 pb-28 pt-6 lg:pb-12">
            <div className="flex flex-wrap items-start gap-4 sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h1
                  className="text-2xl font-bold tracking-tight sm:text-[28px]"
                  title={subtitleAsTooltip ? subtitle : undefined}
                >
                  {title}
                </h1>
                {subtitle && !subtitleAsTooltip ? (
                  <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
                ) : null}
              </div>
              {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
            </div>
            <div className="mt-6">{children}</div>
          </main>
        </div>

        <nav
          className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur lg:hidden"
          aria-label="Primary"
        >
          <div className="grid grid-cols-6">
            {mobileNav.map((item) => {
              const active = pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-1 px-0.5 py-2 text-center text-[10px] font-medium leading-tight",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <item.icon className="size-5" aria-hidden="true" />
                  {item.to === "/dashboard"
                    ? "Home"
                    : item.to === "/inventory"
                      ? "Products"
                      : item.label}
                </Link>
              );
            })}
            <MoreNavMenu items={moreNav} activePath={pathname} launchBadge={launchBadge} mobile />
          </div>
        </nav>

        <QuickAddMenu
          open={quickMenuOpen}
          onOpenChange={setQuickMenuOpen}
          onTypeNote={() => {
            setQuickMenuOpen(false);
            setQuickAddOpen(true);
          }}
        />
        <QuickEntryDialog open={quickAddOpen} onOpenChange={setQuickAddOpen} />
        <AppNavigator />
      </div>
    </TooltipProvider>
  );
}
