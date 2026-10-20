import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Receipt, RotateCcw, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/hooks/use-workspace";
import { getSale, getSales, refundSaleFn } from "@/lib/business.functions";
import { formatMoney, friendlyDate, readableError } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/sale-history")({
  head: () => ({
    meta: [
      { title: "Sales history | BusinessOS AI" },
      { name: "description", content: "Every sale, and refunds when something needs to go back." },
    ],
  }),
  component: SalesHistory,
});

function statusMeta(status: string) {
  switch (status) {
    case "completed":
      return { label: "Completed", className: "bg-success-soft text-success" };
    case "partially_refunded":
      return { label: "Partially refunded", className: "bg-warning-soft text-warning-foreground" };
    case "refunded":
      return { label: "Refunded", className: "bg-muted text-muted-foreground line-through" };
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

function SalesHistory() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workspace = useWorkspace();
  const businessId = workspace.data?.business.id;
  const currency = workspace.data?.business.currency ?? "USD";
  const canRefund = ["owner", "admin", "manager"].includes(workspace.data?.role ?? "");

  const [search, setSearch] = useState("");
  const [activeSaleId, setActiveSaleId] = useState<string | null>(null);
  const [refunding, setRefunding] = useState(false);
  const [refundQuantities, setRefundQuantities] = useState<Record<string, string>>({});
  const [refundReason, setRefundReason] = useState("");

  const fetchSales = useServerFn(getSales);
  const fetchSale = useServerFn(getSale);
  const refundFn = useServerFn(refundSaleFn);

  useEffect(() => {
    if (!workspace.isLoading && workspace.data === null) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [workspace.isLoading, workspace.data, navigate]);

  const sales = useQuery({
    queryKey: ["sales-history", businessId, search],
    enabled: Boolean(businessId),
    queryFn: () => fetchSales({ data: { businessId: businessId!, search } }),
  });

  const detail = useQuery({
    queryKey: ["sale-detail", businessId, activeSaleId],
    enabled: Boolean(businessId) && Boolean(activeSaleId),
    queryFn: () => fetchSale({ data: { businessId: businessId!, saleId: activeSaleId! } }),
  });

  function openSale(saleId: string) {
    setActiveSaleId(saleId);
    setRefunding(false);
    setRefundQuantities({});
    setRefundReason("");
  }

  const refundMutation = useMutation({
    mutationFn: () => {
      const items = Object.entries(refundQuantities)
        .map(([saleItemId, qty]) => ({ saleItemId, quantity: Number(qty) }))
        .filter((item) => item.quantity > 0);
      return refundFn({
        data: { businessId: businessId!, saleId: activeSaleId!, items, reason: refundReason },
      });
    },
    onSuccess: async () => {
      toast.success("Refund recorded, stock updated.");
      setRefunding(false);
      setRefundQuantities({});
      setRefundReason("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["sales-history", businessId] }),
        queryClient.invalidateQueries({ queryKey: ["sale-detail", businessId, activeSaleId] }),
        queryClient.invalidateQueries({ queryKey: ["products"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    },
    onError: (error: Error) => toast.error(readableError(error, "Couldn't process that refund.")),
  });

  if (!workspace.data) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  const rows = sales.data ?? [];
  const canSubmitRefund = Object.values(refundQuantities).some((v) => Number(v) > 0);

  return (
    <AppShell
      businessName={workspace.data.business.name}
      role={workspace.data.role}
      plan={workspace.data.plan}
      isReadOnly={workspace.data.isReadOnly}
      billingEnabled={workspace.data.billingEnabled}
      title="Sales history"
      subtitle="Every sale, and refunds when something needs to go back."
      actions={
        <Button variant="outline" className="gap-1.5" onClick={() => navigate({ to: "/sales" })}>
          <ArrowLeft className="size-4" aria-hidden="true" /> Back to counter
        </Button>
      }
    >
      <div className="mb-4 max-w-sm">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by sale number"
            className="pl-9"
          />
        </div>
      </div>

      <div className="surface overflow-hidden">
        {sales.isLoading ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Receipt className="mx-auto size-9 text-muted-foreground" aria-hidden="true" />
            <h2 className="mt-3 text-lg font-semibold">No sales yet</h2>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
              Sales recorded at the counter show up here.
            </p>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-border lg:hidden">
              {rows.map((sale) => (
                <li key={sale.id}>
                  <button
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-4 text-left"
                    onClick={() => openSale(sale.id)}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{sale.sale_number}</p>
                      <p className="truncate text-[13px] text-muted-foreground">
                        {sale.customer_name ?? "Walk-in"} · {formatMoney(sale.total, currency)}
                      </p>
                    </div>
                    <StatusBadge status={sale.status} />
                  </button>
                </li>
              ))}
            </ul>

            <table className="hidden w-full text-sm lg:table">
              <thead>
                <tr className="border-b border-border text-left text-[12px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Sale</th>
                  <th className="px-5 py-3 font-medium">Customer</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Total</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((sale) => (
                  <tr
                    key={sale.id}
                    className="cursor-pointer hover:bg-accent/40"
                    onClick={() => openSale(sale.id)}
                  >
                    <td className="px-5 py-3 font-medium">{sale.sale_number}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {sale.customer_name ?? "Walk-in"}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {friendlyDate(sale.created_at)}
                    </td>
                    <td className="px-5 py-3 font-medium tabular-nums">
                      {formatMoney(sale.total, currency)}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={sale.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      <Dialog open={Boolean(activeSaleId)} onOpenChange={(open) => !open && setActiveSaleId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          {!detail.data ? (
            <div className="space-y-3 py-6">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <DialogTitle>{detail.data.sale.sale_number}</DialogTitle>
                  <StatusBadge status={detail.data.sale.status} />
                </div>
                <DialogDescription>
                  {(detail.data.sale as unknown as { customers: { name: string } | null }).customers
                    ?.name ?? "Walk-in"}{" "}
                  · {friendlyDate(detail.data.sale.created_at)}
                </DialogDescription>
              </DialogHeader>

              <ul className="divide-y divide-border rounded-lg border border-border">
                {detail.data.items.map((item) => {
                  const remaining = item.quantity - item.refunded_quantity;
                  return (
                    <li key={item.id} className="px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate">
                          {item.name}{" "}
                          <span className="text-muted-foreground">× {item.quantity}</span>
                          {item.refunded_quantity > 0 ? (
                            <span className="text-muted-foreground">
                              {" "}
                              ({item.refunded_quantity} refunded)
                            </span>
                          ) : null}
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {formatMoney(item.line_total, currency)}
                        </span>
                      </div>
                      {refunding && remaining > 0 ? (
                        <div className="mt-2 flex items-center gap-2">
                          <Label className="text-xs text-muted-foreground">Refund qty</Label>
                          <Input
                            type="number"
                            min={0}
                            max={remaining}
                            step="any"
                            className="h-8 w-24"
                            value={refundQuantities[item.id] ?? ""}
                            onChange={(e) =>
                              setRefundQuantities((prev) => ({
                                ...prev,
                                [item.id]: e.target.value,
                              }))
                            }
                          />
                          <span className="text-xs text-muted-foreground">of {remaining} left</span>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>

              <div className="surface space-y-1.5 p-4 text-sm">
                <div className="flex justify-between border-t border-border pt-1.5 text-base font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">
                    {formatMoney(detail.data.sale.total, currency)}
                  </span>
                </div>
              </div>

              {detail.data.refunds.length > 0 ? (
                <div className="space-y-1.5 text-sm">
                  <p className="font-medium">Refund history</p>
                  {detail.data.refunds.map((r) => (
                    <div key={r.id} className="flex justify-between text-muted-foreground">
                      <span>
                        {friendlyDate(r.created_at)}
                        {r.reason ? ` · ${r.reason}` : ""}
                      </span>
                      <span className="tabular-nums">-{formatMoney(r.total, currency)}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              {canRefund &&
              ["completed", "partially_refunded"].includes(detail.data.sale.status) ? (
                refunding ? (
                  <div className="space-y-3 border-t border-border pt-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="refund-reason">Reason (optional)</Label>
                      <Textarea
                        id="refund-reason"
                        value={refundReason}
                        onChange={(e) => setRefundReason(e.target.value)}
                        rows={2}
                      />
                    </div>
                    <DialogFooter className="gap-2 sm:gap-2">
                      <Button variant="ghost" onClick={() => setRefunding(false)}>
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        disabled={!canSubmitRefund || refundMutation.isPending}
                        onClick={() => refundMutation.mutate()}
                      >
                        {refundMutation.isPending ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                        ) : null}
                        Confirm refund
                      </Button>
                    </DialogFooter>
                  </div>
                ) : (
                  <DialogFooter>
                    <Button
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => setRefunding(true)}
                    >
                      <RotateCcw className="size-4" aria-hidden="true" /> Refund items
                    </Button>
                  </DialogFooter>
                )
              ) : null}
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
