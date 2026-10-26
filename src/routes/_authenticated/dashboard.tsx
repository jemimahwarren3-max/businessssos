import { useEffect, useState } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  Info,
  Plus,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { hasPermission, useWorkspace } from "@/hooks/use-workspace";
import { getDashboard, getWorkspace } from "@/lib/business.functions";
import { formatMoney, formatNumber, formatPercent, greeting, readableError } from "@/lib/format";
import { getStorefrontAdminFn } from "@/lib/storefront/storefront.functions";
import { storePublicUrl } from "@/lib/storefront/host";
import { BRAND } from "@/lib/brand";
import { getDailyBusinessBriefingFn } from "@/lib/growth.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  beforeLoad: async () => {
    const workspace = await getWorkspace();
    if (!workspace) {
      throw redirect({ to: "/onboarding", replace: true });
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

const RANGES = [
  { key: "1", label: "Today" },
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
  { key: "90", label: "3 months" },
  { key: "365", label: "1 year" },
];

// The area chart below conveys this same trend purely visually — screen
// reader users get this sentence instead via role="img"/aria-label.
function salesChartSummary(
  series: { label: string; sales: number; profit: number }[],
  currency: string,
) {
  if (series.length === 0) return "No sales data for this period.";
  const first = series[0]!;
  const last = series[series.length - 1]!;
  return (
    `Sales and profit from ${first.label} to ${last.label}: ` +
    `sales went from ${formatMoney(first.sales, currency)} to ${formatMoney(last.sales, currency)}, ` +
    `profit went from ${formatMoney(first.profit, currency)} to ${formatMoney(last.profit, currency)}.`
  );
}

function Dashboard() {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const [range, setRange] = useState("7");
  const fetchDashboard = useServerFn(getDashboard);
  const fetchBriefing = useServerFn(getDailyBusinessBriefingFn);
  const businessId = workspace.data?.business.id;
  const canReadBriefing =
    hasPermission(workspace.data, "reports.financial") && hasPermission(workspace.data, "ai.use");

  useEffect(() => {
    if (!workspace.isLoading && workspace.data === null) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [workspace.isLoading, workspace.data, navigate]);

  const dashboard = useQuery({
    queryKey: ["dashboard", businessId, range],
    enabled: Boolean(businessId),
    queryFn: () => fetchDashboard({ data: { businessId: businessId!, days: Number(range) } }),
  });
  const loadStore = useServerFn(getStorefrontAdminFn);
  const storefront = useQuery({
    queryKey: ["storefront", businessId],
    enabled: Boolean(businessId),
    queryFn: () => loadStore({ data: { businessId: businessId! } }),
  });
  const briefing = useQuery({
    queryKey: ["daily-business-briefing", businessId],
    enabled: Boolean(businessId) && canReadBriefing,
    staleTime: 60 * 60 * 1000,
    queryFn: () => fetchBriefing({ data: { businessId: businessId! } }),
  });

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

  return (
    <AppShell
      businessName={workspace.data.business.name}
      role={workspace.data.role}
      plan={workspace.data.plan}
      isReadOnly={workspace.data.isReadOnly}
      billingEnabled={workspace.data.billingEnabled}
      title={`${greeting()}`}
      subtitle={`Here's how ${workspace.data.business.name} is doing.`}
      actions={
        <Button className="gap-1.5" onClick={() => navigate({ to: "/inventory" })}>
          <Plus className="size-4" aria-hidden="true" /> Add product
        </Button>
      }
    >
      {storefront.data && !storefront.data.checklist.published ? (
        <section className="surface mb-4 p-5">
          <h2 className="text-lg font-semibold">Finish your shop</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Unpublished shops are not visible to customers. Continue setup or preview a draft.
          </p>
          <ol className="mt-3 space-y-1 text-sm">
            {(
              [
                ["name", "Shop name"],
                ["template", "Template"],
                ["products", "A published product"],
                ["payments", "A payment method"],
                ["fulfilment", "Pickup or delivery"],
                ["published", "Publish"],
              ] as const
            ).map(([key, label]) => (
              <li key={key}>
                {storefront.data?.checklist[key] ? "Done" : "To do"} — {label}
              </li>
            ))}
          </ol>
          {storefront.data.store?.slug ? (
            <p className="mt-2 text-sm">
              Draft:{" "}
              <Link
                to="/store/$slug"
                params={{ slug: storefront.data.store.slug }}
                search={{ preview: "1" }}
              >
                Preview
              </Link>
              {" · "}
              {storePublicUrl(storefront.data.store.slug)}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/onboarding">Continue setup</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/storefront">Storefront settings</Link>
            </Button>
          </div>
        </section>
      ) : null}
      {canReadBriefing ? (
        <section className="surface mb-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Sparkles className="size-4.5 text-primary" aria-hidden="true" />
                Your AI business briefing
              </h2>
              <p className="text-[13px] text-muted-foreground">
                A daily AI briefing based on recorded business and opted-in storefront activity.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/growth">Explore growth</Link>
            </Button>
          </div>
          {briefing.isLoading ? (
            <Skeleton className="mt-4 h-16 w-full" />
          ) : briefing.isError ? (
            <p className="mt-4 text-sm text-destructive">
              {readableError(briefing.error, "Today's AI briefing is unavailable.")}
            </p>
          ) : briefing.data ? (
            <div>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">
                {briefing.data.text}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {briefing.data.cached ? "Today's saved briefing" : "Generated today"} ·{" "}
                {new Date(briefing.data.generatedAt).toLocaleTimeString("en", {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}
      {canReadBriefing && data ? (
        <section className="surface mb-4 space-y-3 p-5">
          <div>
            <h2 className="text-base font-semibold">Recommended next steps</h2>
            <p className="text-[13px] text-muted-foreground">
              Based on your recorded business activity. Each button opens a page for you to review
              and decide; AI does not apply changes.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.lowStockCount > 0 ? (
              <Button asChild size="sm" variant="outline">
                <Link to="/inventory">Review {data.lowStockCount} low-stock items</Link>
              </Button>
            ) : null}
            {data.outstanding > 0 ? (
              <Button asChild size="sm" variant="outline">
                <Link to="/invoices">Review outstanding invoices</Link>
              </Button>
            ) : null}
            {storefront.data && !storefront.data.checklist.published ? (
              <Button asChild size="sm" variant="outline">
                <Link to="/storefront">Continue building your shop</Link>
              </Button>
            ) : null}
            <Button asChild size="sm" variant="outline">
              <Link to="/insights">Review sales and stock insights</Link>
            </Button>
          </div>
        </section>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Today's sales"
          value={data ? formatMoney(data.todaySales, currency) : undefined}
          hint={data ? `${formatPercent(data.salesChange)} vs previous period` : undefined}
          tone={data && data.salesChange < 0 ? "down" : "up"}
          icon={TrendingUp}
        />
        <StatCard
          label="Today's profit"
          value={data ? formatMoney(data.todayProfit, currency) : undefined}
          hint={data ? `${formatPercent(data.profitChange)} vs previous period` : undefined}
          tone={data && data.profitChange < 0 ? "down" : "up"}
          icon={Wallet}
        />
        <StatCard
          label="Customers who owe you"
          value={data ? formatMoney(data.outstanding, currency) : undefined}
          hint={
            data
              ? `${data.outstandingCustomers} customer${data.outstandingCustomers === 1 ? "" : "s"}`
              : undefined
          }
          icon={Users}
        />
        <StatCard
          label="Low stock"
          value={data ? `${formatNumber(data.lowStockCount)} products` : undefined}
          hint={data ? `${data.urgentStockCount} out of stock` : undefined}
          tone={data && data.lowStockCount > 0 ? "down" : "up"}
          icon={Boxes}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="surface p-5 lg:col-span-2">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">Sales and profit</h2>
              <p className="text-[13px] text-muted-foreground">Based on completed sales.</p>
            </div>
            <Tabs value={range} onValueChange={setRange} className="shrink-0">
              <TabsList>
                {RANGES.map((r) => (
                  <TabsTrigger key={r.key} value={r.key} className="text-[12px] sm:text-[13px]">
                    {r.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
          <div
            className="mt-5 h-64"
            role={data ? "img" : undefined}
            aria-label={data ? salesChartSummary(data.series, currency) : undefined}
          >
            {dashboard.isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.series ?? []}>
                  <defs>
                    <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--color-border)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    width={54}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid var(--color-border)",
                      background: "var(--color-card)",
                      fontSize: 13,
                    }}
                    formatter={(value: number) => formatMoney(Number(value), currency)}
                  />
                  <Area
                    type="monotone"
                    dataKey="sales"
                    name="Sales"
                    stroke="var(--color-chart-1)"
                    strokeWidth={2}
                    fill="url(#salesFill)"
                  />
                  <Area
                    type="monotone"
                    dataKey="profit"
                    name="Profit"
                    stroke="var(--color-chart-2)"
                    strokeWidth={2}
                    fill="none"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="surface p-5">
          <h2 className="text-lg font-semibold">Business Health</h2>
          <p className="text-[13px] text-muted-foreground">
            Calculated from your own data, no guesswork.
          </p>
          {data ? (
            <>
              <div className="mt-5 flex items-center gap-4">
                <div className="grid size-20 shrink-0 place-items-center rounded-full border-4 border-primary/25">
                  <span className="text-2xl font-bold">{data.health.score}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-base font-semibold">{data.health.label}</p>
                  <p className="text-[13px] text-muted-foreground">out of 100</p>
                </div>
              </div>
              <ul className="mt-5 space-y-2.5 text-sm">
                {data.health.signals.map((signal) => (
                  <li key={signal.text} className="flex gap-2">
                    {signal.tone === "good" ? (
                      <CheckCircle2
                        className="mt-0.5 size-4 shrink-0 text-success"
                        aria-hidden="true"
                      />
                    ) : signal.tone === "warn" ? (
                      <AlertTriangle
                        className="mt-0.5 size-4 shrink-0 text-warning"
                        aria-hidden="true"
                      />
                    ) : (
                      <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden="true" />
                    )}
                    <span className="text-muted-foreground">{signal.text}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <Skeleton className="mt-5 h-40 w-full" />
          )}
        </section>
      </div>

      <section className="surface mt-4 p-5">
        <h2 className="text-lg font-semibold">Needs restocking</h2>
        {data && data.lowStock.length > 0 ? (
          <ul className="mt-4 divide-y divide-border">
            {data.lowStock.map((item) => (
              <li
                key={item.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className="text-[13px] text-muted-foreground">
                    Minimum {formatNumber(item.min_stock)} {item.unit}
                  </p>
                </div>
                <span
                  className={
                    item.stock <= 0
                      ? "rounded-lg bg-danger-soft px-2.5 py-1 text-[13px] font-semibold text-destructive"
                      : "rounded-lg bg-warning-soft px-2.5 py-1 text-[13px] font-semibold text-warning-foreground"
                  }
                >
                  {item.stock <= 0 ? "Out of stock" : `${formatNumber(item.stock)} left`}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            {data ? "Nothing is running low right now." : "Loading…"}
          </p>
        )}
      </section>
    </AppShell>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone,
  icon: Icon,
}: {
  label: string;
  value?: string | undefined;
  hint?: string | undefined;
  tone?: "up" | "down" | undefined;
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
      {value ? (
        <p className="mt-2.5 text-[26px] font-bold tracking-tight">{value}</p>
      ) : (
        <Skeleton className="mt-2.5 h-8 w-28" />
      )}
      {hint ? (
        <p className="mt-1 flex items-center gap-1 text-[13px] text-muted-foreground">
          {tone === "down" ? (
            <ArrowDownRight className="size-3.5 text-destructive" aria-hidden="true" />
          ) : tone === "up" ? (
            <ArrowUpRight className="size-3.5 text-success" aria-hidden="true" />
          ) : null}
          {hint}
        </p>
      ) : null}
    </div>
  );
}
