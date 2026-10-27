import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminRuntimeFn, updateAdminRuntimeFn } from "@/lib/admin/admin.functions";
import { friendlyDateTime, readableError } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/admin/system")({
  component: AdminSystemPage,
});

function AdminSystemPage() {
  const queryClient = useQueryClient();
  const fetchRuntime = useServerFn(getAdminRuntimeFn);
  const saveRuntime = useServerFn(updateAdminRuntimeFn);
  const runtime = useQuery({
    queryKey: ["admin-runtime"],
    queryFn: () => fetchRuntime(),
  });
  const [billingEnforced, setBillingEnforced] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (runtime.data) setBillingEnforced(runtime.data.billing_enforced);
  }, [runtime.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      saveRuntime({
        data: {
          billingEnforced,
          reason,
        },
      }),
    onSuccess: async () => {
      toast.success("Platform runtime updated.");
      setReason("");
      await queryClient.invalidateQueries({ queryKey: ["admin-runtime"] });
    },
    onError: (error: Error) => toast.error(readableError(error, "Could not save.")),
  });

  return (
    <AdminShell title="System">
      {runtime.isLoading ? <Skeleton className="h-24" /> : null}
      <div className="surface max-w-xl space-y-4 p-5">
        <h2 className="text-sm font-semibold">Paid operate enforcement (database)</h2>
        <p className="text-sm text-muted-foreground">
          Works together with Cloud Run <code className="text-xs">BILLING_ENABLED=true</code>. When
          both are on, Postgres RPCs block publish, POS, and cash drawer without an active Pro
          subscription. Keep off on staging during free beta.
        </p>
        {runtime.data ? (
          <p className="text-xs text-muted-foreground">
            Last updated {friendlyDateTime(runtime.data.updated_at)}
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          <Badge variant={billingEnforced ? "default" : "outline"}>
            billing_enforced: {billingEnforced ? "true" : "false"}
          </Badge>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={billingEnforced}
            onChange={(event) => setBillingEnforced(event.target.checked)}
          />
          Enforce subscription in Postgres RPCs
        </label>
        <div className="space-y-1.5">
          <Label htmlFor="sys-reason">Reason (audit)</Label>
          <Input
            id="sys-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
        <Button
          type="button"
          disabled={saveMutation.isPending || reason.trim().length < 3}
          onClick={() => saveMutation.mutate()}
        >
          Save runtime
        </Button>
      </div>
    </AdminShell>
  );
}
