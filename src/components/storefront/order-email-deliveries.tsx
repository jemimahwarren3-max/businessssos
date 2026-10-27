import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { friendlyDateTime, readableError } from "@/lib/format";
import {
  listOrderEmailDeliveriesFn,
  retryOrderEmailDeliveryFn,
} from "@/lib/notifications.functions";

const STATUS_LABEL: Record<string, string> = {
  pending: "Queued",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed",
  skipped: "Skipped",
};

export function OrderEmailDeliveries({
  businessId,
  orderId,
}: {
  businessId: string;
  orderId: string;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(listOrderEmailDeliveriesFn);
  const retry = useServerFn(retryOrderEmailDeliveryFn);
  const deliveries = useQuery({
    queryKey: ["order-email-deliveries", businessId, orderId],
    queryFn: () => load({ data: { businessId, orderId } }),
  });

  if (deliveries.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading email delivery history…</p>;
  }
  if (deliveries.isError) {
    return (
      <p className="text-sm text-destructive">
        {readableError(deliveries.error as Error, "Email history could not be loaded.")}
      </p>
    );
  }
  const rows = deliveries.data ?? [];
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No email deliveries recorded for this order yet. Messages stay queued until Resend is
        configured and the outbox is flushed.
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-2 rounded-md border p-3">
      <p className="font-medium">Email delivery</p>
      <ul className="divide-y text-sm">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
            <div>
              <p>
                {row.recipientRole === "customer" ? "Customer" : "Staff"} ·{" "}
                {STATUS_LABEL[row.status] ?? row.status}
              </p>
              <p className="text-muted-foreground">{row.subject}</p>
              <p className="text-xs text-muted-foreground">
                {friendlyDateTime(row.createdAt)}
                {row.sentAt ? ` · sent ${friendlyDateTime(row.sentAt)}` : ""}
                {row.attempts > 1 ? ` · ${row.attempts} attempts` : ""}
              </p>
              {row.status === "failed" && row.lastError ? (
                <p className="text-xs text-destructive">{row.lastError}</p>
              ) : null}
            </div>
            {row.status === "failed" || row.status === "pending" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  void retry({ data: { businessId, outboxId: row.id } }).then(() => {
                    void queryClient.invalidateQueries({
                      queryKey: ["order-email-deliveries", businessId, orderId],
                    });
                  })
                }
              >
                Retry
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
