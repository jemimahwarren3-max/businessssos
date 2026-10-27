import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Check, Loader2, Pencil, Percent } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { hasPermission, useWorkspace } from "@/hooks/use-workspace";
import { getCommissionReportFn, setCommissionRateFn } from "@/lib/business.functions";
import { formatMoney, readableError } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/commission")({
  head: () => ({
    meta: [
      { title: "Sales commission | Kwetuu" },
      { name: "description", content: "What each team member sold, and what they've earned." },
    ],
  }),
  component: Commission,
});

const RANGES = [
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
  { key: "90", label: "3 months" },
  { key: "365", label: "1 year" },
];

function Commission() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workspace = useWorkspace();
  const businessId = workspace.data?.business.id;
  const currency = workspace.data?.business.currency ?? "USD";
  const canManage = hasPermission(workspace.data, "roles.manage");

  const [range, setRange] = useState("30");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const fetchReport = useServerFn(getCommissionReportFn);
  const setRateFn = useServerFn(setCommissionRateFn);

  useEffect(() => {
    if (!workspace.isLoading && workspace.data === null) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [workspace.isLoading, workspace.data, navigate]);

  const report = useQuery({
    queryKey: ["commission-report", businessId, range],
    enabled: Boolean(businessId),
    queryFn: () => fetchReport({ data: { businessId: businessId!, days: Number(range) } }),
  });

  const rateMutation = useMutation({
    mutationFn: (input: { memberUserId: string; rate: number }) =>
      setRateFn({ data: { businessId: businessId!, ...input } }),
    onSuccess: async () => {
      toast.success("Commission rate updated.");
      setEditingId(null);
      await queryClient.invalidateQueries({ queryKey: ["commission-report", businessId] });
    },
    onError: (error: Error) => toast.error(readableError(error, "Couldn't update that rate.")),
  });

  if (!workspace.data) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (!canManage) {
    return (
      <AppShell
        businessName={workspace.data.business.name}
        role={workspace.data.role}
        plan={workspace.data.plan}
        isReadOnly={workspace.data.isReadOnly}
        billingEnabled={workspace.data.billingEnabled}
        title="Sales commission"
        subtitle="What each team member sold, and what they've earned."
      >
        <div className="surface px-6 py-16 text-center">
          <Percent className="mx-auto size-9 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-semibold">Owners and admins only</h2>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
            Ask an owner or admin if you need to see commission data.
          </p>
        </div>
      </AppShell>
    );
  }

  const rows = report.data ?? [];
  const totalCommission = rows.reduce((sum, r) => sum + r.commission_earned, 0);

  return (
    <AppShell
      businessName={workspace.data.business.name}
      role={workspace.data.role}
      plan={workspace.data.plan}
      isReadOnly={workspace.data.isReadOnly}
      billingEnabled={workspace.data.billingEnabled}
      title="Sales commission"
      subtitle="What each team member sold, and what they've earned."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            className="gap-1.5"
            onClick={() => navigate({ to: "/reports" })}
          >
            <ArrowLeft className="size-4" aria-hidden="true" /> Back to reports
          </Button>
          <Tabs value={range} onValueChange={setRange}>
            <TabsList>
              {RANGES.map((r) => (
                <TabsTrigger key={r.key} value={r.key} className="text-[12px] sm:text-[13px]">
                  {r.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      }
    >
      <div className="surface mb-4 p-5">
        <p className="text-sm text-muted-foreground">Total commission owed this period</p>
        <p className="mt-1 text-2xl font-bold tabular-nums">
          {formatMoney(totalCommission, currency)}
        </p>
      </div>

      <div className="surface overflow-hidden">
        {report.isLoading ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Percent className="mx-auto size-9 text-muted-foreground" aria-hidden="true" />
            <h2 className="mt-3 text-lg font-semibold">No active team members</h2>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[12px] uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-3 font-medium">Team member</th>
                <th className="px-5 py-3 font-medium">Rate</th>
                <th className="px-5 py-3 font-medium">Sales</th>
                <th className="px-5 py-3 font-medium">Sales total</th>
                <th className="px-5 py-3 font-medium">Commission</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.user_id}>
                  <td className="px-5 py-3 font-medium">{r.display_name}</td>
                  <td className="px-5 py-3">
                    {editingId === r.user_id ? (
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step="0.5"
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="h-8 w-20"
                        />
                        <span className="text-muted-foreground">%</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          disabled={rateMutation.isPending}
                          onClick={() =>
                            rateMutation.mutate({
                              memberUserId: r.user_id,
                              rate: Number(editValue) || 0,
                            })
                          }
                        >
                          {rateMutation.isPending ? (
                            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                          ) : (
                            <Check className="size-3.5" aria-hidden="true" />
                          )}
                        </Button>
                      </div>
                    ) : (
                      <button
                        className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setEditingId(r.user_id);
                          setEditValue(String(r.commission_rate));
                        }}
                      >
                        {r.commission_rate}%
                        <Pencil className="size-3" aria-hidden="true" />
                      </button>
                    )}
                  </td>
                  <td className="px-5 py-3 tabular-nums text-muted-foreground">{r.sales_count}</td>
                  <td className="px-5 py-3 tabular-nums text-muted-foreground">
                    {formatMoney(r.sales_total, currency)}
                  </td>
                  <td className="px-5 py-3 font-semibold tabular-nums">
                    {formatMoney(r.commission_earned, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}
