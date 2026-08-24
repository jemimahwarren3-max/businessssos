import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Info, Lightbulb, PackageSearch, RefreshCw, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { hasPermission, useWorkspace } from "@/hooks/use-workspace";
import { getInsightsFn, getWeeklyReportFn } from "@/lib/business.functions";
import { formatNumber, readableError } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/insights")({
  head: () => ({
    meta: [
      { title: "Insights — BusinessOS AI" },
      {
        name: "description",
        content: "A weekly report, low-stock forecasts, and anomalies spotted in your data.",
      },
      { property: "og:title", content: "Insights — BusinessOS AI" },
      { property: "og:description", content: "What changed, what needs attention, what's next." },
    ],
  }),
  component: Insights,
});

function Insights() {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const businessId = workspace.data?.business.id;
  const canUse = hasPermission(workspace.data, "reports.financial");

  const fetchInsights = useServerFn(getInsightsFn);
  const fetchWeeklyReport = useServerFn(getWeeklyReportFn);

  useEffect(() => {
    if (!workspace.isLoading && workspace.data === null) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [workspace.isLoading, workspace.data, navigate]);

  const insights = useQuery({
    queryKey: ["insights", businessId],
    enabled: Boolean(businessId) && canUse,
    queryFn: () => fetchInsights({ data: { businessId: businessId! } }),
  });

  const report = useMutation({
    mutationFn: (forceRegenerate: boolean) =>
      fetchWeeklyReport({ data: { businessId: businessId!, forceRegenerate } }),
    onError: (error: Error) => {
      toast.error(readableError(error, "The weekly report isn't available right now."));
    },
  });

  if (!workspace.data) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (!canUse) {
    return (
      <AppShell
        businessName={workspace.data.business.name}
        role={workspace.data.role}
        plan={workspace.data.plan}
        isReadOnly={workspace.data.isReadOnly}
        billingEnabled={workspace.data.billingEnabled}
        title="Insights"
        subtitle="A weekly report and alerts drawn from your data."
      >
        <div className="surface px-6 py-16 text-center">
          <Lightbulb className="mx-auto size-9 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-semibold">Your role can't view insights</h2>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
            Ask an owner, admin or manager for access — insights share financial data.
          </p>
        </div>
      </AppShell>
    );
  }

  const anomalies = insights.data?.anomalies ?? [];
  const forecast = insights.data?.forecast ?? [];

  return (
    <AppShell
      businessName={workspace.data.business.name}
      role={workspace.data.role}
      plan={workspace.data.plan}
      isReadOnly={workspace.data.isReadOnly}
      billingEnabled={workspace.data.billingEnabled}
      title="Insights"
      subtitle="A weekly report, low-stock forecasts, and anomalies spotted in your data."
    >
      <section className="surface p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Sparkles className="size-4.5 text-primary" aria-hidden="true" />
              This week's report
            </h2>
            <p className="text-[13px] text-muted-foreground">
              An AI-written summary of the last 7 days — grounded in your real numbers.
            </p>
          </div>
          {report.data ? (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5"
              disabled={report.isPending}
              onClick={() => report.mutate(true)}
            >
              <RefreshCw
                className={`size-3.5 ${report.isPending ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              Regenerate
            </Button>
          ) : null}
        </div>

        {report.data ? (
          <div className="mt-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{report.data.text}</p>
            <p className="mt-3 text-[12px] text-muted-foreground">
              {report.data.cached ? "From cache — " : "Just generated — "}
              {new Date(report.data.generatedAt).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          </div>
        ) : (
          <div className="mt-4 flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">
              Not generated yet this week. It only costs a moment — and stays cached for a day.
            </p>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={report.isPending || !businessId}
              onClick={() => report.mutate(false)}
            >
              {report.isPending ? (
                <RefreshCw className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="size-3.5" aria-hidden="true" />
              )}
              Generate this week's report
            </Button>
          </div>
        )}
      </section>

      <section className="surface mt-4 p-5">
        <h2 className="text-lg font-semibold">Needs attention</h2>
        <p className="text-[13px] text-muted-foreground">
          Patterns worth a second look, compared to the week before.
        </p>
        {insights.isLoading ? (
          <Skeleton className="mt-4 h-16 w-full" />
        ) : anomalies.length > 0 ? (
          <ul className="mt-4 space-y-2.5 text-sm">
            {anomalies.map((signal, index) => (
              <li key={index} className="flex gap-2">
                {signal.severity === "warning" ? (
                  <AlertTriangle
                    className="mt-0.5 size-4 shrink-0 text-warning"
                    aria-hidden="true"
                  />
                ) : (
                  <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden="true" />
                )}
                <span className="text-muted-foreground">{signal.message}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Nothing unusual this week — everything is tracking close to normal.
          </p>
        )}
      </section>

      <section className="surface mt-4 p-5">
        <h2 className="text-lg font-semibold">Inventory forecast</h2>
        <p className="text-[13px] text-muted-foreground">
          Based on the last 30 days of sales — products at risk of running out soon.
        </p>
        {insights.isLoading ? (
          <Skeleton className="mt-4 h-16 w-full" />
        ) : forecast.length > 0 ? (
          <ul className="mt-4 divide-y divide-border">
            {forecast.map((item) => (
              <li
                key={item.productId}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className="text-[13px] text-muted-foreground">
                    {formatNumber(item.stock)} {item.unit} left
                    {item.dailyVelocity > 0
                      ? ` · selling ~${formatNumber(item.dailyVelocity)}/day`
                      : ""}
                  </p>
                </div>
                <span
                  className={
                    item.urgency === "out"
                      ? "rounded-lg bg-danger-soft px-2.5 py-1 text-[13px] font-semibold text-destructive"
                      : item.urgency === "critical"
                        ? "rounded-lg bg-danger-soft px-2.5 py-1 text-[13px] font-semibold text-destructive"
                        : "rounded-lg bg-warning-soft px-2.5 py-1 text-[13px] font-semibold text-warning-foreground"
                  }
                >
                  {item.urgency === "out"
                    ? "Out of stock"
                    : `~${Math.max(1, Math.round(item.daysUntilStockout ?? 0))}d left`}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <PackageSearch className="size-4 shrink-0" aria-hidden="true" />
            Nothing is projected to run out in the next two weeks.
          </div>
        )}
      </section>
    </AppShell>
  );
}
