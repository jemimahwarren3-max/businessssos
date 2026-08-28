import { useState } from "react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  challengeAdminMfaFn,
  checkPlatformAdmin,
  enrollAdminMfaFn,
  getAdminOverview,
  overrideSubscriptionFn,
  verifyAdminMfaChallengeFn,
  verifyAdminMfaEnrollmentFn,
} from "@/lib/admin/admin.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MfaChallenge, MfaEnroll } from "@/components/mfa";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney, friendlyDate, readableError } from "@/lib/format";

// Not linked from anywhere in the app's nav — a non-admin visitor gets a
// real 404 (see beforeLoad below), not a login redirect, so the route's
// existence isn't revealed. See src/lib/admin/ for the authorization model.
export const Route = createFileRoute("/admin")({
  // Deliberately SSR'd (unlike the offline-capable _authenticated group) —
  // that's what makes the notFound() below a real HTTP 404 status for a
  // non-admin, not just a client-rendered 404 after the SPA shell loads.
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  beforeLoad: async () => {
    const status = await checkPlatformAdmin().catch(() => ({ isAdmin: false as const }));
    if (!status.isAdmin) throw notFound();
  },
  component: AdminPage,
});

const PLANS = ["free", "starter", "business", "pro"] as const;
const STATUSES = ["trialing", "active", "past_due", "canceled", "incomplete", "unpaid"] as const;

type OverrideTarget = { businessId: string; businessName: string } | null;

function AdminPage() {
  const checkStatus = useServerFn(checkPlatformAdmin);
  const enrollFn = useServerFn(enrollAdminMfaFn);
  const verifyEnrollFn = useServerFn(verifyAdminMfaEnrollmentFn);
  const challengeFn = useServerFn(challengeAdminMfaFn);
  const verifyChallengeFn = useServerFn(verifyAdminMfaChallengeFn);
  const status = useQuery({
    queryKey: ["admin-mfa-status"],
    queryFn: () => checkStatus(),
  });

  if (status.isLoading || !status.data || !status.data.isAdmin) {
    return (
      <div className="mx-auto max-w-md p-6 pt-24">
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!status.data.enrolled) {
    return (
      <div className="mx-auto max-w-sm p-6 pt-24">
        <div className="surface p-6">
          <MfaEnroll
            onDone={() => status.refetch()}
            enrollFn={enrollFn}
            verifyFn={verifyEnrollFn}
            title="Set up admin authentication"
            description="This account requires an authenticator app before you can continue."
          />
        </div>
      </div>
    );
  }
  if (status.data.currentLevel !== "aal2") {
    return (
      <div className="mx-auto max-w-sm p-6 pt-24">
        <div className="surface p-6">
          <MfaChallenge
            factorId={status.data.factorId!}
            onDone={() => status.refetch()}
            challengeFn={challengeFn}
            verifyFn={verifyChallengeFn}
          />
        </div>
      </div>
    );
  }
  return <AdminDashboard />;
}

function AdminDashboard() {
  const queryClient = useQueryClient();
  const fetchOverview = useServerFn(getAdminOverview);
  const overrideFn = useServerFn(overrideSubscriptionFn);
  const [target, setTarget] = useState<OverrideTarget>(null);
  const [plan, setPlan] = useState<string>("business");
  const [status, setStatus] = useState<string>("active");
  const [periodEnd, setPeriodEnd] = useState("");
  const [reason, setReason] = useState("");

  const overview = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => fetchOverview(),
  });

  const overrideMutation = useMutation({
    mutationFn: () =>
      overrideFn({
        data: {
          businessId: target!.businessId,
          plan,
          status,
          currentPeriodEnd: new Date(periodEnd).toISOString(),
          reason,
        },
      }),
    onSuccess: async () => {
      toast.success("Subscription updated.");
      setTarget(null);
      setReason("");
      await queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (error: Error) =>
      toast.error(readableError(error, "Couldn't update that subscription.")),
  });

  const stats = overview.data?.stats as
    | {
        businesses_total: number;
        users_total: number;
        signups_last_30_days: number;
        payments_paid_total: number;
        payments_paid_count: number;
        payments_failed_count: number;
        payments_stuck_count: number;
      }
    | undefined;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <h1 className="text-xl font-bold">Platform admin</h1>

        {overview.isLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Businesses", stats?.businesses_total ?? 0],
              ["Total users", stats?.users_total ?? 0],
              ["Signups (30d)", stats?.signups_last_30_days ?? 0],
              ["Paid total", formatMoney(Number(stats?.payments_paid_total ?? 0))],
              ["Paid count", stats?.payments_paid_count ?? 0],
              ["Failed", stats?.payments_failed_count ?? 0],
              ["Stuck (>1h)", stats?.payments_stuck_count ?? 0],
            ].map(([label, value]) => (
              <div key={label} className="surface p-3">
                <p className="text-[11px] uppercase text-muted-foreground">{label}</p>
                <p className="text-lg font-semibold tabular-nums">{value}</p>
              </div>
            ))}
          </div>
        )}

        <div className="surface overflow-hidden">
          <h2 className="p-4 text-sm font-semibold">Subscriptions</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Trial ends</TableHead>
                <TableHead>Period ends</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(overview.data?.subscriptions ?? []).map((s) => (
                <TableRow key={s.business_id}>
                  <TableCell className="font-medium">{s.business_name}</TableCell>
                  <TableCell className="capitalize">{s.plan ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{s.status ?? "—"}</Badge>
                  </TableCell>
                  <TableCell>{s.trial_ends_at ? friendlyDate(s.trial_ends_at) : "—"}</TableCell>
                  <TableCell>
                    {s.current_period_end ? friendlyDate(s.current_period_end) : "—"}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setTarget({ businessId: s.business_id, businessName: s.business_name });
                        setPlan(s.plan ?? "business");
                        setStatus(s.status ?? "active");
                        setPeriodEnd("");
                        setReason("");
                      }}
                    >
                      Override
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="surface overflow-hidden">
          <h2 className="p-4 text-sm font-semibold">Recent payments</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(overview.data?.payments ?? []).map((p) => (
                <TableRow key={p.reference}>
                  <TableCell className="font-medium">{p.business_name}</TableCell>
                  <TableCell className="capitalize">
                    {p.plan} · {p.interval}ly
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatMoney(Number(p.amount), p.currency)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{p.status}</Badge>
                  </TableCell>
                  <TableCell>{friendlyDate(p.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={Boolean(target)} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Override {target?.businessName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Plan</Label>
              <Select value={plan} onValueChange={setPlan}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLANS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="period-end">Current period ends</Label>
              <Input
                id="period-end"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reason">Reason (for your own record)</Label>
              <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={overrideMutation.isPending || !periodEnd || reason.trim().length < 3}
              onClick={() => overrideMutation.mutate()}
            >
              {overrideMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
