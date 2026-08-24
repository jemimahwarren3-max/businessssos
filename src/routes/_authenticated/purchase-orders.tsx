import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardList, Download } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspace } from "@/hooks/use-workspace";
import { getPurchaseOrders } from "@/lib/business.functions";
import { formatMoney, friendlyDate } from "@/lib/format";
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

// Read-only for now — created only via the "Order" button on Suppliers.
// No status-change UI yet (the "received"/"cancelled" states exist in the
// database for later use, but nothing sets them today).
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
  const workspace = useWorkspace();
  const businessId = workspace.data?.business.id;
  const currency = workspace.data?.business.currency ?? "USD";

  const fetchPurchaseOrders = useServerFn(getPurchaseOrders);

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
              {rows.map((po) => (
                <li
                  key={po.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{po.po_number}</p>
                    <p className="truncate text-[13px] text-muted-foreground">
                      {po.supplier_name ?? "No supplier"} · {formatMoney(po.total, currency)}
                    </p>
                  </div>
                  <StatusBadge status={po.status} />
                </li>
              ))}
            </ul>

            <table className="hidden w-full text-sm lg:table">
              <thead>
                <tr className="border-b border-border text-left text-[12px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 font-medium">PO</th>
                  <th className="px-5 py-3 font-medium">Supplier</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Total</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((po) => (
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
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </AppShell>
  );
}
