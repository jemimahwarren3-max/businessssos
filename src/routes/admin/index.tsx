import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminOverview, getAdminRuntimeFn } from "@/lib/admin/admin.functions";
import { formatMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/admin/")({
  component: AdminOverviewPage,
});

function AdminOverviewPage() {
  const fetchOverview = useServerFn(getAdminOverview);
  const fetchRuntime = useServerFn(getAdminRuntimeFn);
  const overview = useQuery({ queryKey: ["admin-overview"], queryFn: () => fetchOverview() });
  const runtime = useQuery({ queryKey: ["admin-runtime"], queryFn: () => fetchRuntime() });

  const stats = overview.data?.stats as
    | {
        businesses_total: number;
        users_total: number;
        signups_last_30_days: number;
        payments_paid_total: number;
        payments_paid_count: number;
        payments_failed_count: number;
        payments_stuck_count: number;
        businesses_by_plan?: Record<string, number>;
        businesses_by_status?: Record<string, number>;
      }
    | undefined;

  return (
    <AdminShell title="Overview">
      {overview.isLoading ? <Skeleton className="h-24" /> : null}
      {stats ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[
            ["Businesses", stats.businesses_total],
            ["Users", stats.users_total],
            ["Signups (30d)", stats.signups_last_30_days],
            ["Paid total", formatMoney(Number(stats.payments_paid_total))],
            ["Paid count", stats.payments_paid_count],
            ["Failed payments", stats.payments_failed_count],
            ["Stuck (>1h)", stats.payments_stuck_count],
          ].map(([label, value]) => (
            <div key={String(label)} className="surface p-3">
              <p className="text-[11px] uppercase text-muted-foreground">{label}</p>
              <p className="text-lg font-semibold tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {runtime.data ? (
        <div className="surface flex flex-wrap items-center gap-3 p-4 text-sm">
          <span className="font-medium">Platform runtime</span>
          <Badge variant={runtime.data.billing_enforced ? "default" : "outline"}>
            Billing enforced: {runtime.data.billing_enforced ? "on" : "off"}
          </Badge>
          <Badge variant={runtime.data.announcement_enabled ? "default" : "outline"}>
            Merchant banner: {runtime.data.announcement_enabled ? "on" : "off"}
          </Badge>
          <Button asChild size="sm" variant="outline">
            <Link to="/admin/system">System settings</Link>
          </Button>
        </div>
      ) : null}

      {stats?.businesses_by_plan ? (
        <div className="surface p-4">
          <h2 className="text-sm font-semibold">Businesses by plan</h2>
          <ul className="mt-2 flex flex-wrap gap-2 text-sm">
            {Object.entries(stats.businesses_by_plan).map(([plan, n]) => (
              <li key={plan}>
                <Badge variant="secondary" className="capitalize">
                  {plan}: {n}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { to: "/admin/businesses", label: "All businesses" },
          { to: "/admin/stores", label: "Storefronts" },
          { to: "/admin/orders", label: "Recent shop orders" },
          { to: "/admin/communications", label: "Email outbox" },
          { to: "/admin/billing", label: "Subscriptions & Paynow" },
          { to: "/admin/integrations", label: "Paynow shop gate" },
          { to: "/admin/personalize", label: "Homepage & merchant banner" },
          { to: "/admin/health", label: "Ops health checks" },
          { to: "/admin/audit", label: "Audit trail" },
        ].map((link) => (
          <Button key={link.to} asChild variant="outline" className="h-auto justify-start py-3">
            <Link to={link.to}>{link.label}</Link>
          </Button>
        ))}
      </div>
    </AdminShell>
  );
}
