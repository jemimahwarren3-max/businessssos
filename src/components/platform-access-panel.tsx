import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  decidePlatformAccessRequestFn,
  endPlatformAccessFn,
  listPlatformAccessRequestsFn,
} from "@/lib/business.functions";
import { friendlyDateTime, readableError } from "@/lib/format";

const STATUS_LABEL: Record<string, string> = {
  pending: "Waiting for your decision",
  approved: "Access active",
  declined: "Declined",
  ended: "Ended",
  expired: "Expired",
};

export function PlatformAccessPanel({ businessId }: { businessId: string }) {
  const queryClient = useQueryClient();
  const listRequests = useServerFn(listPlatformAccessRequestsFn);
  const decide = useServerFn(decidePlatformAccessRequestFn);
  const endAccess = useServerFn(endPlatformAccessFn);
  const queryKey = ["platform-access", businessId];

  const requests = useQuery({
    queryKey,
    queryFn: () => listRequests({ data: { businessId } }),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey });

  const decideMutation = useMutation({
    mutationFn: (input: { requestId: string; approve: boolean }) =>
      decide({ data: { businessId, ...input, hours: 24 } }),
    onSuccess: async (_, input) => {
      toast.success(input.approve ? "Support access approved for 24 hours." : "Request declined.");
      await refresh();
    },
    onError: (error: Error) => toast.error(readableError(error, "Could not save your decision.")),
  });

  const endMutation = useMutation({
    mutationFn: () => endAccess({ data: { businessId } }),
    onSuccess: async () => {
      toast.success("Support access ended.");
      await refresh();
    },
    onError: (error: Error) => toast.error(readableError(error, "Could not end access.")),
  });

  const rows = requests.data ?? [];
  const active = rows.find((row) => row.status === "approved");
  const pending = rows.filter((row) => row.status === "pending");

  return (
    <section className="surface space-y-3 p-5">
      <div>
        <h2 className="text-lg font-semibold">Kwetuu support access</h2>
        <p className="text-sm text-muted-foreground">
          Kwetuu support can only change your shop data after you approve a request. You can end
          access at any time.
        </p>
      </div>

      {active ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
          <p className="text-sm">
            Access is active until {friendlyDateTime(active.expiresAt ?? "")}.
          </p>
          <Button
            variant="outline"
            disabled={endMutation.isPending}
            onClick={() => endMutation.mutate()}
          >
            End access
          </Button>
        </div>
      ) : null}

      {pending.map((row) => (
        <div key={row.id} className="space-y-2 rounded-lg border border-border p-3 text-sm">
          <p className="font-medium">Support asked for access</p>
          <p className="text-muted-foreground">Reason: {row.reason}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={decideMutation.isPending}
              onClick={() => decideMutation.mutate({ requestId: row.id, approve: true })}
            >
              Approve for 24 hours
            </Button>
            <Button
              variant="outline"
              disabled={decideMutation.isPending}
              onClick={() => decideMutation.mutate({ requestId: row.id, approve: false })}
            >
              Decline
            </Button>
          </div>
        </div>
      ))}

      {rows.length > 0 ? (
        <ul className="divide-y divide-border text-sm">
          {rows
            .filter((row) => row.status !== "pending")
            .slice(0, 5)
            .map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-2 py-2">
                <span className="text-muted-foreground">{friendlyDateTime(row.requestedAt)}</span>
                <span>{STATUS_LABEL[row.status] ?? row.status}</span>
              </li>
            ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No support access requests.</p>
      )}
    </section>
  );
}
