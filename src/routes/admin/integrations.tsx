import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminIntegrationsFn, setPaynowControlFn } from "@/lib/admin/admin.functions";
import { friendlyDateTime, readableError } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/admin/integrations")({
  component: AdminIntegrationsPage,
});

function AdminIntegrationsPage() {
  const queryClient = useQueryClient();
  const fetch = useServerFn(getAdminIntegrationsFn);
  const save = useServerFn(setPaynowControlFn);
  const list = useQuery({ queryKey: ["admin-integrations"], queryFn: () => fetch() });
  const paynow = list.data?.find((r) => r.provider === "paynow");

  const [enabled, setEnabled] = useState(false);
  const [liveApproved, setLiveApproved] = useState(false);
  const [approvalReference, setApprovalReference] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (paynow) {
      setEnabled(paynow.enabled);
      setLiveApproved(paynow.live_approved);
      setApprovalReference(paynow.approval_reference ?? "");
    }
  }, [paynow]);

  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: { enabled, liveApproved, approvalReference, reason },
      }),
    onSuccess: async () => {
      toast.success("Paynow shop checkout control updated.");
      setReason("");
      await queryClient.invalidateQueries({ queryKey: ["admin-integrations"] });
    },
    onError: (error: Error) => toast.error(readableError(error, "Could not save.")),
  });

  return (
    <AdminShell title="Integrations">
      <p className="text-sm text-muted-foreground">
        Platform-wide switches for automated seller Paynow at checkout. Seller credentials are still
        per shop.
      </p>
      {list.isLoading ? <Skeleton className="h-32" /> : null}
      {paynow ? (
        <div className="surface max-w-lg space-y-4 p-5">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Seller Paynow (shop checkout)</h2>
            <Badge variant={paynow.live_approved ? "default" : "outline"}>
              {paynow.live_approved ? "Live approved" : "Not live"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Last updated {friendlyDateTime(paynow.updated_at)}
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Provider enabled (shops may connect credentials)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={liveApproved}
              onChange={(e) => setLiveApproved(e.target.checked)}
            />
            Live checkout approved (requires reference when live)
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="approval-ref">Approval reference</Label>
            <Input
              id="approval-ref"
              value={approvalReference}
              onChange={(e) => setApprovalReference(e.target.value)}
              placeholder="Paynow ticket or internal sign-off id"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="int-reason">Reason (audit)</Label>
            <Input id="int-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <Button
            type="button"
            disabled={saveMutation.isPending || reason.trim().length < 3}
            onClick={() => saveMutation.mutate()}
          >
            Save Paynow control
          </Button>
        </div>
      ) : null}
    </AdminShell>
  );
}
