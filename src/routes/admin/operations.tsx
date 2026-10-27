import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminRuntimeFn, updateAdminOpsNotesFn } from "@/lib/admin/admin.functions";
import { readableError } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/admin/operations")({
  component: AdminOperationsPage,
});

function AdminOperationsPage() {
  const fetchRuntime = useServerFn(getAdminRuntimeFn);
  const saveNotes = useServerFn(updateAdminOpsNotesFn);
  const queryClient = useQueryClient();
  const runtime = useQuery({
    queryKey: ["admin-runtime"],
    queryFn: () => fetchRuntime(),
  });

  const [courierNotes, setCourierNotes] = useState("");
  const [smsNotes, setSmsNotes] = useState("");
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (!runtime.data) return;
    setCourierNotes(runtime.data.courier_ops_notes ?? "");
    setSmsNotes(runtime.data.sms_ops_notes ?? "");
  }, [runtime.data]);

  const mutation = useMutation({
    mutationFn: () =>
      saveNotes({
        data: {
          courierNotes,
          smsNotes,
          reason: reason.trim() || "Updated courier/SMS operator notes",
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-runtime"] });
      setReason("");
    },
  });

  return (
    <AdminShell title="Courier & SMS (manual ops)">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Kwetuu does not yet integrate courier or SMS APIs here. Use these panels to track manual
        workflows (e.g. DHL handoffs, Econet SMS credits) and share runbooks with your support team.
      </p>
      {runtime.isLoading ? <Skeleton className="h-48" /> : null}
      <div className="grid max-w-3xl gap-6">
        <section className="surface space-y-3 p-4">
          <h2 className="text-sm font-semibold">Courier runbook</h2>
          <Label htmlFor="courier-notes">Notes</Label>
          <Textarea
            id="courier-notes"
            rows={8}
            value={courierNotes}
            onChange={(event) => setCourierNotes(event.target.value)}
            placeholder="Pickup contacts, SLA, how merchants request labels…"
          />
        </section>
        <section className="surface space-y-3 p-4">
          <h2 className="text-sm font-semibold">SMS runbook</h2>
          <Label htmlFor="sms-notes">Notes</Label>
          <Textarea
            id="sms-notes"
            rows={8}
            value={smsNotes}
            onChange={(event) => setSmsNotes(event.target.value)}
            placeholder="Provider account, template IDs, when to enable per tenant…"
          />
        </section>
        <div className="space-y-2">
          <Label htmlFor="ops-reason">Audit reason</Label>
          <Textarea
            id="ops-reason"
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why you changed these notes"
          />
        </div>
        {mutation.isError ? (
          <p className="text-sm text-destructive">
            {readableError(mutation.error as Error, "Could not save notes.")}
          </p>
        ) : null}
        <Button
          type="button"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          Save operator notes
        </Button>
      </div>
    </AdminShell>
  );
}
