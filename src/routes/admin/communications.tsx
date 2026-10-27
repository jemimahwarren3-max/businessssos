import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/admin-shell";
import { flushAdminOutboxFn, getAdminCommunicationsFn } from "@/lib/admin/admin.functions";
import { friendlyDateTime, readableError } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/admin/communications")({
  component: AdminCommunicationsPage,
});

function AdminCommunicationsPage() {
  const queryClient = useQueryClient();
  const fetch = useServerFn(getAdminCommunicationsFn);
  const flush = useServerFn(flushAdminOutboxFn);
  const [reason, setReason] = useState("");
  const comms = useQuery({
    queryKey: ["admin-communications"],
    queryFn: () => fetch(),
  });

  const flushMutation = useMutation({
    mutationFn: () => flush({ data: { reason } }),
    onSuccess: async (result) => {
      toast.success(`Flush done: ${result.sent} sent, ${result.failed} failed.`);
      setReason("");
      await queryClient.invalidateQueries({ queryKey: ["admin-communications"] });
    },
    onError: (error: Error) => toast.error(readableError(error, "Flush failed.")),
  });

  const stats = comms.data?.stats;

  return (
    <AdminShell title="Communications">
      <p className="text-sm text-muted-foreground">
        Merchant shop-alert emails and shopper order mail queue through Resend when configured.
      </p>
      {comms.isLoading ? <Skeleton className="h-24" /> : null}
      {stats ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ["Pending", stats.pending],
            ["Sending", stats.sending],
            ["Failed", stats.failed],
            ["Sent (24h)", stats.sent_24h],
            ["Failed (24h)", stats.failed_24h],
          ].map(([label, value]) => (
            <div key={String(label)} className="surface p-3">
              <p className="text-[11px] uppercase text-muted-foreground">{label}</p>
              <p className="text-lg font-semibold tabular-nums">{value ?? 0}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="surface max-w-md space-y-3 p-4">
        <h2 className="text-sm font-semibold">Flush outbox now</h2>
        <p className="text-xs text-muted-foreground">
          Same job as the internal mail-flush endpoint — use when Resend was down or after fixing
          config.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="flush-reason">Reason (audit)</Label>
          <Input id="flush-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <Button
          type="button"
          disabled={flushMutation.isPending || reason.trim().length < 3}
          onClick={() => flushMutation.mutate()}
        >
          Run flush
        </Button>
      </div>

      <div className="surface overflow-x-auto">
        <h2 className="p-4 text-sm font-semibold">Recent outbox rows</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Business</TableHead>
              <TableHead>To</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Attempts</TableHead>
              <TableHead>When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(comms.data?.rows ?? []).map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.business_name}</TableCell>
                <TableCell className="max-w-[140px] truncate text-xs">{row.to_email}</TableCell>
                <TableCell className="max-w-[200px] truncate text-xs">{row.subject}</TableCell>
                <TableCell>
                  <Badge variant="outline">{row.status}</Badge>
                </TableCell>
                <TableCell>{row.attempts}</TableCell>
                <TableCell className="whitespace-nowrap text-xs">
                  {friendlyDateTime(row.created_at)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AdminShell>
  );
}
