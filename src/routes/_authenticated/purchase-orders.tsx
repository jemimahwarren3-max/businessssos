import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ClipboardList, Download, Loader2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { hasPermission, useWorkspace } from "@/hooks/use-workspace";
import { getPurchaseOrders, updatePurchaseOrderStatus } from "@/lib/business.functions";
import { formatMoney, friendlyDate, readableError } from "@/lib/format";
import { downloadXlsx } from "@/lib/xlsx-export";

export const Route = createFileRoute("/_authenticated/purchase-orders")({
  head: () => ({
    meta: [
      { title: "Purchase Orders — BusinessOS AI" },
      {
        name: "description",
        content: "Every order you've sent to a supplier, in one place.",
      },
      { property: "og:title", content: "Purchase Orders — BusinessOS AI" },
      { property: "og:description", content: "What you've ordered, and from whom." },
    ],
  }),
  component: PurchaseOrders,
});

function statusMeta(status: string) {
  switch (status) {
    case "sent":
      return { label: "Sent", className: "bg-info-soft text-info" };
    case "received":
      return { label: "Received", className: "bg-success-soft text-success" };
    case "cancelled":
      return { label: "Cancelled", className: "bg-muted text-muted-foreground line-through" };
    default:
      return { label: status, className: "bg-muted text-muted-foreground" };
  }
}

function StatusBadge({ status }: { status: string }) {
  const meta = statusMeta(status);
  return (
    <span
      className={`inline-flex shrink-0 rounded-lg px-2.5 py-1 text-[13px] font-semibold ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

function PurchaseOrders() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workspace = useWorkspace();
  const businessId = workspace.data?.business.id;
  const currency = workspace.data?.business.currency ?? "USD";
  const canManage = hasPermission(workspace.data, "purchase_orders.create");

  const fetchPurchaseOrders = useServerFn(getPurchaseOrders);
  const updateStatusFn = useServerFn(updatePurchaseOrderStatus);

  useEffect(() => {
    if (!workspace.isLoading && workspace.data === null) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [workspace.isLoading, workspace.data, navigate]);

  const purchaseOrders = useQuery({
    queryKey: ["purchase-orders", businessId],
    enabled: Boolean(businessId),
    queryFn: () => fetchPurchaseOrders({ data: { businessId: businessId! } }),
  });

  const statusMutation = useMutation({
    mutationFn: (input: { purchaseOrderId: string; status: "received" | "cancelled" }) =>
      updateStatusFn({ data: { businessId: businessId!, ...input } }),
    onSuccess: async (_, { status }) => {
      toast.success(
        status === "received" ? "Marked as received — stock updated." : "Purchase order cancelled.",
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["purchase-orders", businessId] }),
        queryClient.invalidateQueries({ queryKey: ["products"] }),
      ]);
    },
    onError: (error: Error) =>
      toast.error(readableError(error, "Couldn't update that purchase order.")),
  });

  function markReceived(po: { id: string; po_number: string }) {
    if (confirm(`Mark ${po.po_number} as received? This adds its items to stock.`)) {
      statusMutation.mutate({ purchaseOrderId: po.id, status: "received" });
    }
  }

  function cancelOrder(po: { id: string; po_number: string }) {
    if (confirm(`Cancel ${po.po_number}? This can't be undone.`)) {
      statusMutation.mutate({ purchaseOrderId: po.id, status: "cancelled" });
    }
  }

  if (!workspace.data) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  const rows = purchaseOrders.data ?? [];

  function exportExcel() {
    downloadXlsx("purchase-orders", [
      {
        name: "Purchase Orders",
        headers: ["PO number", "Supplier", "Date", "Total", "Status"],
        rows: rows.map((po) => [
          po.po_number,
          po.supplier_name ?? "",
          po.order_date,
          po.total,
          po.status,
        ]),
      },
    ]);
  }

  return (
    <AppShell
      businessName={workspace.data.business.name}
      role={workspace.data.role}
      plan={workspace.data.plan}
      isReadOnly={workspace.data.isReadOnly}
      billingEnabled={workspace.data.billingEnabled}
      title="Purchase Orders"
      subtitle="Every order you've sent to a supplier, in one place."
      actions={
        rows.length > 0 ? (
          <Button variant="outline" className="gap-1.5" onClick={exportExcel}>
            <Download className="size-4" aria-hidden="true" /> Export to Excel
          </Button>
        ) : null
      }
    >
      <div className="surface overflow-hidden">
        {purchaseOrders.isLoading ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <ClipboardList className="mx-auto size-9 text-muted-foreground" aria-hidden="true" />
            <h2 className="mt-3 text-lg font-semibold">No purchase orders yet</h2>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
              Use the "Order" button on a supplier's row in Suppliers to create one.
            </p>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-border lg:hidden">
              {rows.map((po) => {
                const isBusy =
                  statusMutation.isPending && statusMutation.variables?.purchaseOrderId === po.id;
                return (
                  <li key={po.id} className="px-5 py-4">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{po.po_number}</p>
                        <p className="truncate text-[13px] text-muted-foreground">
                          {po.supplier_name ?? "No supplier"} · {formatMoney(po.total, currency)}
                        </p>
                      </div>
                      <StatusBadge status={po.status} />
                    </div>
                    {canManage && po.status === "sent" ? (
                      <div className="mt-3 flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          disabled={isBusy}
                          onClick={() => markReceived(po)}
                        >
                          {isBusy ? (
                            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                          ) : null}
                          Mark received
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isBusy}
                          onClick={() => cancelOrder(po)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            <table className="hidden w-full text-sm lg:table">
              <thead>
                <tr className="border-b border-border text-left text-[12px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 font-medium">PO</th>
                  <th className="px-5 py-3 font-medium">Supplier</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Total</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  {canManage ? <th className="px-5 py-3 font-medium">Actions</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((po) => {
                  const isBusy =
                    statusMutation.isPending && statusMutation.variables?.purchaseOrderId === po.id;
                  return (
                    <tr key={po.id}>
                      <td className="px-5 py-3 font-medium">{po.po_number}</td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {po.supplier_name ?? "No supplier"}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {friendlyDate(po.order_date)}
                      </td>
                      <td className="px-5 py-3 font-medium tabular-nums">
                        {formatMoney(po.total, currency)}
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={po.status} />
                      </td>
                      {canManage ? (
                        <td className="px-5 py-3">
                          {po.status === "sent" ? (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5"
                                disabled={isBusy}
                                onClick={() => markReceived(po)}
                              >
                                {isBusy ? (
                                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                                ) : null}
                                Mark received
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={isBusy}
                                onClick={() => cancelOrder(po)}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : null}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </div>
    </AppShell>
  );
}
