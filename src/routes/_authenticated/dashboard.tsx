import { useEffect } from "react";
import { createFileRoute, isRedirect, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BarChart3,
  Boxes,
  CircleDollarSign,
  PackagePlus,
  Receipt,
  ScanBarcode,
  ShoppingCart,
  Wand2,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { hasPermission, useWorkspace } from "@/hooks/use-workspace";
import { openQuickAddDialog } from "@/lib/quick-add-events";
import { getDashboard, getNotifyEmailFn, getWorkspace } from "@/lib/business.functions";
import { formatMoney, formatNumber, greeting, readableError } from "@/lib/format";
import { StoreLaunchCentre } from "@/components/storefront/store-launch-centre";
import { getStorefrontAdminFn } from "@/lib/storefront/storefront.functions";
import { storePublicUrl } from "@/lib/storefront/host";
import { BRAND } from "@/lib/brand";

export const Route = createFileRoute("/_authenticated/dashboard")({
  beforeLoad: async () => {
    try {
      const workspace = await getWorkspace();
      if (!workspace) {
        throw redirect({ to: "/onboarding", replace: true });
      }
      if (!workspace.business.setup_completed_at) {
        throw redirect({ to: "/setup", replace: true });
      }
    } catch (error) {
      if (isRedirect(error)) throw error;
      // A failed workspace load must not bounce an existing shop back into
      // onboarding. The page shows retry instead.
    }
  },
  head: () => ({
    meta: [
      { title: `Dashboard | ${BRAND.name}` },
      {
        name: "description",
        content:
          "Today's sales, profit, outstanding payments, low stock and your business health score.",
      },
      { property: "og:title", content: `Dashboard | ${BRAND.name}` },
      { property: "og:description", content: "See how your business is doing today." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const fetchDashboard = useServerFn(getDashboard);
  const businessId = workspace.data?.business.id;
  const canReadSales = hasPermission(workspace.data, "reports.financial");
  const canCreateSales = hasPermission(workspace.data, "sales.create");
  const canReadExpenses = hasPermission(workspace.data, "expenses.create");
  const canReadInventory = hasPermission(workspace.data, "inventory.import");
  const canReadFinancials = hasPermission(workspace.data, "reports.financial");
  const canManageStore = hasPermission(workspace.data, "business.settings");
  const canUseQuickAdd = hasPermission(workspace.data, "ai.use");

  useEffect(() => {
    if (!workspace.isLoading && workspace.data === null) {
      navigate({ to: "/onboarding", replace: true });
    } else if (workspace.data && !workspace.data.business.setup_completed_at) {
      navigate({ to: "/setup", replace: true });
    }
  }, [workspace.isLoading, workspace.data, navigate]);

  const dashboard = useQuery({
    queryKey: ["dashboard", businessId],
    enabled: Boolean(businessId),
    queryFn: () => fetchDashboard({ data: { businessId: businessId!, days: 7 } }),
  });
  const loadStore = useServerFn(getStorefrontAdminFn);
  const storefront = useQuery({
    queryKey: ["storefront", businessId],
    enabled: Boolean(businessId) && canManageStore,
    queryFn: () => loadStore({ data: { businessId: businessId! } }),
  });
  const fetchNotifyEmail = useServerFn(getNotifyEmailFn);
  const notifyEmail = useQuery({
    queryKey: ["notify-email", businessId],
    enabled: Boolean(businessId) && canManageStore,
    queryFn: () => fetchNotifyEmail({ data: { businessId: businessId! } }),
    staleTime: 60_000,
  });

  if (workspace.isError) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6 text-center">
        <h1 className="text-2xl font-semibold">We couldn't open your dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Nothing was deleted. Try again, or open shop setup if you still need to finish creating
          your store.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button className="rounded-full" onClick={() => void workspace.refetch()}>
            Try again
          </Button>
          <Button asChild variant="outline" className="rounded-full">
            <Link to="/onboarding">Open shop setup</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!workspace.data) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-4 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  const currency = dashboard.data?.currency ?? workspace.data.business.currency;
  const data = dashboard.data;
  const summaryCards = [
    ...(canReadSales
      ? [
          {
            label: "Today's sales",
            value: data?.todaySales == null ? undefined : formatMoney(data.todaySales, currency),
            icon: ShoppingCart,
          },
        ]
      : []),
    ...(canReadExpenses
      ? [
          {
            label: "Today's expenses",
            value:
              data?.todayExpenses == null ? undefined : formatMoney(data.todayExpenses, currency),
            icon: Receipt,
          },
        ]
      : []),
    ...(canReadFinancials
      ? [
          {
            label: "Estimated profit",
            value:
              data?.todayEstimatedProfit == null
                ? undefined
                : formatMoney(data.todayEstimatedProfit, currency),
            hint: "Sales minus expenses",
            icon: CircleDollarSign,
          },
        ]
      : []),
    ...(canReadInventory
      ? [
          {
            label: "Low-stock products",
            value: data == null ? undefined : `${formatNumber(data.lowStockCount)} products`,
            icon: Boxes,
          },
        ]
      : []),
  ];
  const actions = [
    ...(canCreateSales ? [{ label: "Add sale", to: "/sales", icon: ShoppingCart }] : []),
    ...(canReadInventory ? [{ label: "Add stock", to: "/inventory", icon: PackagePlus }] : []),
    ...(canReadExpenses ? [{ label: "Record expense", to: "/expenses", icon: Receipt }] : []),
    ...(canReadFinancials ? [{ label: "View reports", to: "/reports", icon: BarChart3 }] : []),
  ];

  return (
    <AppShell
      businessName={workspace.data.business.name}
      role={workspace.data.role}
      plan={workspace.data.plan}
      isReadOnly={workspace.data.isReadOnly}
      billingEnabled={workspace.data.billingEnabled}
      title={`${greeting()}`}
      subtitleAsTooltip
      subtitle={`Business activity for ${workspace.data.business.name}`}
      mobileQuickAddFab={canUseQuickAdd}
    >
      <div className="flex flex-col gap-6">
        {actions.length > 0 || canUseQuickAdd ? (
          <section className="order-1 lg:order-3" aria-labelledby="quick-actions-heading">
            <h2 id="quick-actions-heading" className="mb-3 text-base font-semibold">
              Quick actions
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {canUseQuickAdd ? (
                <Button
                  type="button"
                  variant="default"
                  className="min-h-12 justify-start gap-2 sm:col-span-2 lg:col-span-1"
                  onClick={() => openQuickAddDialog()}
                >
                  <Wand2 className="size-4 shrink-0" aria-hidden="true" />
                  Quick add
                </Button>
              ) : null}
              {canCreateSales ? (
                <Button asChild variant="outline" className="min-h-12 justify-start gap-2">
                  <Link to="/sales">
                    <ScanBarcode className="size-4 shrink-0" aria-hidden="true" />
                    Sales & scan
                  </Link>
                </Button>
              ) : null}
              {actions.map((action) =>
                action.to === "/sales" ? null : (
                  <Button
                    key={action.to}
                    asChild
                    variant="outline"
                    className="min-h-12 justify-start gap-2"
                  >
                    <Link to={action.to}>
                      <action.icon className="size-4 shrink-0" aria-hidden="true" />
                      {action.label}
                    </Link>
                  </Button>
                ),
              )}
            </div>
            {canUseQuickAdd ? (
              <p className="mt-2 text-[13px] text-muted-foreground">
                Type or paste a note, attach a file, or take a photo. Kwetuu turns it into sales,
                stock, or expenses when it is clear enough.
              </p>
            ) : null}
          </section>
        ) : null}

        <section className="order-2 lg:order-2" aria-label="Business summary">
          <h2 className="sr-only">Business summary</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((card) => (
              <StatCard
                key={card.label}
                label={card.label}
                value={dashboard.isError ? "Unavailable" : card.value}
                hint={card.hint}
                icon={card.icon}
              />
            ))}
            {dashboard.isLoading
              ? [0, 1, 2, 3]
                  .slice(summaryCards.length)
                  .map((item) => (
                    <div key={item} className="surface h-28 animate-pulse" aria-hidden="true" />
                  ))
              : null}
          </div>
          {dashboard.isError ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <p role="alert" className="text-sm text-destructive">
                {readableError(dashboard.error, "Business summary could not be loaded.")}
              </p>
              <Button variant="outline" size="sm" onClick={() => void dashboard.refetch()}>
                Try again
              </Button>
            </div>
          ) : null}
        </section>

        {canManageStore && storefront.data ? (
          <div className="order-3 lg:order-1">
            <StoreLaunchCentre
              admin={storefront.data}
              billingEnabled={workspace.data.billingEnabled}
              isOperateLocked={workspace.data.isOperateLocked}
              notificationsConfigured={notifyEmail.data === true}
              compact
              reminder
              {...(storefront.data.store?.slug
                ? { publicUrl: storePublicUrl(storefront.data.store.slug) }
                : {})}
            />
          </div>
        ) : null}
        {storefront.isError ? (
          <p role="alert" className="order-3 text-sm text-destructive lg:order-1">
            {readableError(storefront.error, "Store status is temporarily unavailable.")}
          </p>
        ) : null}
      </div>

      <section className="surface mt-6 p-5" aria-labelledby="recent-activity-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="recent-activity-heading" className="text-base font-semibold">
            Recent activity
          </h2>
          {canReadFinancials ? (
            <Button asChild variant="ghost" size="sm">
              <Link to="/reports">View reports</Link>
            </Button>
          ) : null}
        </div>
        {dashboard.isLoading ? (
          <Skeleton className="mt-4 h-20 w-full" />
        ) : dashboard.isError ? (
          <p className="mt-4 text-sm text-muted-foreground">Activity is unavailable.</p>
        ) : data?.recentActivity.length ? (
          <ul className="mt-3 divide-y divide-border">
            {data.recentActivity.map((item, index) => (
              <li
                key={`${item.type}-${item.date}-${index}`}
                className="flex min-h-12 items-center justify-between gap-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.type === "sale" ? "Sale" : "Expense"} ·{" "}
                    {new Date(item.date).toLocaleDateString()}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-medium tabular-nums">
                  {formatMoney(item.amount, currency)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">No recent activity to show.</p>
        )}
      </section>
    </AppShell>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value?: string | undefined;
  hint?: string | undefined;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="surface p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <Icon className="size-4 shrink-0 text-muted-foreground" />
      </div>
      {value !== undefined ? (
        <p className="mt-2.5 text-[26px] font-bold tracking-tight">{value}</p>
      ) : (
        <Skeleton className="mt-2.5 h-8 w-28" />
      )}
      {hint ? <p className="mt-1 text-[13px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
