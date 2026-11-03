import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plus, Wallet } from "lucide-react";
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
import { LineItemsEditor } from "@/components/line-items-editor";
import { hasPermission, useWorkspace } from "@/hooks/use-workspace";
import {
  addLayby,
  addLaybyInstalment,
  applyCustomerDepositFn,
  cancelLaybyFn,
  collectLaybyFn,
  getCustomerDeposits,
  getCustomers,
  getLaybys,
  getProducts,
  refundCustomerDepositFn,
} from "@/lib/business.functions";
import {
  applyDepositSchema,
  createLaybySchema,
  depositIdSchema,
  laybyIdSchema,
  laybyInstalmentSchema,
  type LineItemInput,
} from "@/lib/business.schemas";
import { formatMoney, friendlyDate, readableError } from "@/lib/format";
import { CREDIT_REPAYMENT_RAILS, railToPaymentMethod } from "@/lib/payment-rails";

const EMPTY_ITEM: LineItemInput = {
  productId: "",
  name: "",
  quantity: 1,
  unitPrice: 0,
  taxRate: 0,
};

export const Route = createFileRoute("/_authenticated/lay-by")({
  head: () => ({
    meta: [
      { title: "Lay-by | Kwetuu" },
      {
        name: "description",
        content:
          "Hold goods while a customer pays in instalments. Stock comes off only at collect.",
      },
      { property: "og:title", content: "Lay-by | Kwetuu" },
    ],
  }),
  component: LayByPage,
});

type LaybyRow = {
  id: string;
  layby_number: string;
  status: string;
  total: number;
  amount_paid: number;
  collect_after: number;
  notes: string | null;
  created_at: string;
  customer_id: string;
  sale_id: string | null;
  customers:
    { name: string; phone: string | null } | { name: string; phone: string | null }[] | null;
};

type DepositRow = {
  id: string;
  customer_id: string;
  amount: number;
  status: string;
  method: string;
  created_at: string;
  customers: { name: string } | { name: string }[] | null;
};

function depositCustomerName(row: DepositRow): string {
  const related = row.customers;
  if (Array.isArray(related)) return related[0]?.name ?? "Customer";
  return related?.name ?? "Customer";
}

function customerLabel(row: LaybyRow): string {
  const related = row.customers;
  if (Array.isArray(related)) return related[0]?.name ?? "Customer";
  return related?.name ?? "Customer";
}

function LayByPage() {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  const businessId = workspace.data?.business.id;
  const currency = workspace.data?.business.currency ?? "USD";
  const canSell = hasPermission(workspace.data, "sales.create");
  const canPay = hasPermission(workspace.data, "payments.record");

  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [collectAfter, setCollectAfter] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItemInput[]>([{ ...EMPTY_ITEM }]);
  const [payTarget, setPayTarget] = useState<LaybyRow | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payRail, setPayRail] = useState("cash");
  const [payReference, setPayReference] = useState("");
  const [applyTarget, setApplyTarget] = useState<DepositRow | null>(null);
  const [applyLaybyId, setApplyLaybyId] = useState("");

  const fetchLaybys = useServerFn(getLaybys);
  const fetchCustomers = useServerFn(getCustomers);
  const fetchProducts = useServerFn(getProducts);
  const fetchDeposits = useServerFn(getCustomerDeposits);
  const createLaybyFn = useServerFn(addLayby);
  const instalmentFn = useServerFn(addLaybyInstalment);
  const collectFn = useServerFn(collectLaybyFn);
  const cancelFn = useServerFn(cancelLaybyFn);
  const refundFn = useServerFn(refundCustomerDepositFn);
  const applyFn = useServerFn(applyCustomerDepositFn);

  useEffect(() => {
    if (!workspace.isLoading && workspace.data === null) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [workspace.isLoading, workspace.data, navigate]);

  const laybys = useQuery({
    queryKey: ["laybys", businessId],
    enabled: Boolean(businessId),
    queryFn: () => fetchLaybys({ data: { businessId: businessId! } }),
  });
  const customers = useQuery({
    queryKey: ["customers", businessId, ""],
    enabled: Boolean(businessId) && open,
    queryFn: () => fetchCustomers({ data: { businessId: businessId!, search: "" } }),
  });
  const products = useQuery({
    queryKey: ["products", businessId, ""],
    enabled: Boolean(businessId) && open,
    queryFn: () => fetchProducts({ data: { businessId: businessId!, search: "" } }),
  });
  const deposits = useQuery({
    queryKey: ["customer-deposits", businessId],
    enabled: Boolean(businessId),
    queryFn: () => fetchDeposits({ data: { businessId: businessId! } }),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const parsed = createLaybySchema.parse({
        businessId,
        customerId,
        notes,
        collectAfter: collectAfter === "" ? undefined : Number(collectAfter),
        items: items.filter((item) => item.productId),
      });
      return createLaybyFn({ data: parsed });
    },
    onSuccess: async () => {
      setOpen(false);
      setCustomerId("");
      setCollectAfter("");
      setNotes("");
      setItems([{ ...EMPTY_ITEM }]);
      toast.success("Lay-by opened. Stock stays on the shelf until they collect.");
      await queryClient.invalidateQueries({ queryKey: ["laybys"] });
    },
    onError: (error: Error) => toast.error(readableError(error, "We couldn't open that lay-by.")),
  });

  const payMutation = useMutation({
    mutationFn: async () => {
      const parsed = laybyInstalmentSchema.parse({
        businessId,
        laybyId: payTarget!.id,
        amount: Number(payAmount),
        method: railToPaymentMethod(payRail),
        rail: payRail,
        reference: payReference,
        idempotencyKey: crypto.randomUUID(),
      });
      return instalmentFn({ data: parsed });
    },
    onSuccess: async () => {
      setPayTarget(null);
      toast.success("Instalment recorded.");
      await queryClient.invalidateQueries({ queryKey: ["laybys"] });
      await queryClient.invalidateQueries({ queryKey: ["daily-takings"] });
      await queryClient.invalidateQueries({ queryKey: ["cash-drawer"] });
    },
    onError: (error: Error) =>
      toast.error(readableError(error, "We couldn't record that instalment.")),
  });

  const collectMutation = useMutation({
    mutationFn: async (laybyId: string) =>
      collectFn({ data: { businessId: businessId!, laybyId } }),
    onSuccess: async () => {
      toast.success("Collected. Stock came off and cash already taken was not posted again.");
      await queryClient.invalidateQueries({ queryKey: ["laybys"] });
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (error: Error) =>
      toast.error(readableError(error, "We couldn't collect that lay-by.")),
  });

  const cancelMutation = useMutation({
    mutationFn: async (laybyId: string) => {
      const parsed = laybyIdSchema.parse({ businessId, laybyId });
      return cancelFn({ data: parsed });
    },
    onSuccess: async () => {
      toast.success("Cancelled. Money already taken is now a held deposit.");
      await queryClient.invalidateQueries({ queryKey: ["laybys"] });
      await queryClient.invalidateQueries({ queryKey: ["customer-deposits"] });
    },
    onError: (error: Error) => toast.error(readableError(error, "We couldn't cancel that lay-by.")),
  });

  const refundMutation = useMutation({
    mutationFn: async (depositId: string) => {
      const parsed = depositIdSchema.parse({ businessId, depositId });
      return refundFn({ data: parsed });
    },
    onSuccess: async () => {
      toast.success("Deposit refunded.");
      await queryClient.invalidateQueries({ queryKey: ["customer-deposits"] });
      await queryClient.invalidateQueries({ queryKey: ["cash-drawer"] });
    },
    onError: (error: Error) =>
      toast.error(readableError(error, "We couldn't refund that deposit.")),
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      const parsed = applyDepositSchema.parse({
        businessId,
        depositId: applyTarget!.id,
        target: applyLaybyId ? "layby" : "credit",
        laybyId: applyLaybyId || undefined,
      });
      return applyFn({ data: parsed });
    },
    onSuccess: async () => {
      setApplyTarget(null);
      setApplyLaybyId("");
      toast.success("Deposit applied.");
      await queryClient.invalidateQueries({ queryKey: ["customer-deposits"] });
      await queryClient.invalidateQueries({ queryKey: ["laybys"] });
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (error: Error) => toast.error(readableError(error, "We couldn't apply that deposit.")),
  });

  if (!workspace.data) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  const rows = (laybys.data ?? []) as LaybyRow[];
  const heldDeposits = ((deposits.data ?? []) as DepositRow[]).filter(
    (row) => row.status === "held",
  );
  const openLaybys = rows.filter((row) => row.status === "open" || row.status === "ready");

  return (
    <AppShell
      businessName={workspace.data.business.name}
      role={workspace.data.role}
      plan={workspace.data.plan}
      isReadOnly={workspace.data.isReadOnly}
      billingEnabled={workspace.data.billingEnabled}
      title="Lay-by"
      subtitle="Hold goods for a customer while they pay in instalments. This is not an invoice. Stock comes off only when they collect."
      actions={
        canSell ? (
          <Button className="gap-1.5" onClick={() => setOpen(true)}>
            <Plus className="size-4" aria-hidden="true" /> Open lay-by
          </Button>
        ) : null
      }
    >
      <div className="surface overflow-hidden">
        {laybys.isLoading ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Wallet className="mx-auto size-9 text-muted-foreground" aria-hidden="true" />
            <h2 className="mt-3 text-lg font-semibold">No lay-bys yet</h2>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
              Open a lay-by for a named customer. They can pay bit by bit. You collect when they
              have paid the collect-after amount.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => {
              const remaining = Math.max(Number(row.total) - Number(row.amount_paid), 0);
              const ready =
                row.status === "ready" || Number(row.amount_paid) >= Number(row.collect_after);
              return (
                <li key={row.id} className="space-y-3 px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {row.layby_number} · {customerLabel(row)}
                      </p>
                      <p className="text-[13px] text-muted-foreground">
                        {formatMoney(Number(row.amount_paid), currency)} of{" "}
                        {formatMoney(Number(row.total), currency)} paid · collect after{" "}
                        {formatMoney(Number(row.collect_after), currency)} · {row.status} ·{" "}
                        {friendlyDate(row.created_at)}
                      </p>
                    </div>
                    <span className="text-[13px] font-semibold tabular-nums">
                      {remaining > 0 ? `${formatMoney(remaining, currency)} left` : "Paid in full"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canPay &&
                    (row.status === "open" || row.status === "ready") &&
                    remaining > 0 ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setPayAmount(String(remaining));
                          setPayRail("cash");
                          setPayReference("");
                          setPayTarget(row);
                        }}
                      >
                        Take instalment
                      </Button>
                    ) : null}
                    {canSell &&
                    ready &&
                    row.status !== "collected" &&
                    row.status !== "cancelled" ? (
                      <Button
                        size="sm"
                        onClick={() => collectMutation.mutate(row.id)}
                        disabled={collectMutation.isPending}
                      >
                        Collect
                      </Button>
                    ) : null}
                    {canSell && row.status !== "collected" && row.status !== "cancelled" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (
                            confirm(
                              "Cancel this lay-by? Money already taken becomes a held deposit. It is not refunded automatically.",
                            )
                          ) {
                            cancelMutation.mutate(row.id);
                          }
                        }}
                      >
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Held deposits</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Money taken without a sale. Apply it to credit or a lay-by, or refund it. Not an invoice.
        </p>
        <div className="surface mt-3 overflow-hidden">
          {deposits.isLoading ? (
            <div className="p-5">
              <Skeleton className="h-12" />
            </div>
          ) : heldDeposits.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted-foreground">
              No held deposits. Take one from a customer on the Customers page.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {heldDeposits.map((deposit) => (
                <li
                  key={deposit.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                >
                  <p className="text-sm">
                    {depositCustomerName(deposit)} · {formatMoney(Number(deposit.amount), currency)}{" "}
                    held
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {canPay ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setApplyLaybyId("");
                            setApplyTarget(deposit);
                          }}
                        >
                          Apply
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => refundMutation.mutate(deposit.id)}
                          disabled={refundMutation.isPending}
                        >
                          Refund
                        </Button>
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Open a lay-by</DialogTitle>
            <DialogDescription>
              Prices are locked at today&apos;s selling price. Stock is not deducted until collect.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="layby-customer">Customer</Label>
              <select
                id="layby-customer"
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">Select a customer</option>
                {((customers.data ?? []) as { id: string; name: string }[]).map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </div>
            <LineItemsEditor
              items={items}
              onChange={setItems}
              products={(
                (products.data ?? []) as {
                  id: string;
                  name: string;
                  selling_price: number;
                  tax_rate: number;
                }[]
              ).map((product) => ({
                id: product.id,
                name: product.name,
                price: Number(product.selling_price),
                tax_rate: Number(product.tax_rate),
              }))}
              currency={currency}
            />
            <div className="space-y-1.5">
              <Label htmlFor="layby-collect">Collect after (optional)</Label>
              <Input
                id="layby-collect"
                inputMode="decimal"
                value={collectAfter}
                onChange={(e) => setCollectAfter(e.target.value)}
                placeholder="Leave blank to require the full total"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="layby-notes">Notes (optional)</Label>
              <Input
                id="layby-notes"
                value={notes}
                maxLength={600}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !customerId}
            >
              {createMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              Open lay-by
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(payTarget)}
        onOpenChange={(next) => {
          if (!next) setPayTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Take an instalment</DialogTitle>
            <DialogDescription>
              {payTarget
                ? `${formatMoney(Number(payTarget.total) - Number(payTarget.amount_paid), currency)} left on ${payTarget.layby_number}. Cash needs an open drawer.`
                : "Record an instalment."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="layby-pay-amount">Amount</Label>
              <Input
                id="layby-pay-amount"
                inputMode="decimal"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="layby-pay-rail">How they paid</Label>
              <select
                id="layby-pay-rail"
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={payRail}
                onChange={(e) => setPayRail(e.target.value)}
              >
                {CREDIT_REPAYMENT_RAILS.map((rail) => (
                  <option key={rail.value} value={rail.value}>
                    {rail.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="layby-pay-ref">Reference (optional)</Label>
              <Input
                id="layby-pay-ref"
                value={payReference}
                maxLength={120}
                onChange={(e) => setPayReference(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPayTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => payMutation.mutate()}
              disabled={payMutation.isPending || Number(payAmount) <= 0}
            >
              {payMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              Save instalment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(applyTarget)}
        onOpenChange={(next) => {
          if (!next) setApplyTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Apply a deposit</DialogTitle>
            <DialogDescription>
              Apply to the credit book, or to an open lay-by for the same customer. Money was
              already taken. This does not post cash again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="apply-target">Apply to</Label>
            <select
              id="apply-target"
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={applyLaybyId}
              onChange={(e) => setApplyLaybyId(e.target.value)}
            >
              <option value="">Credit book</option>
              {openLaybys
                .filter((row) => row.customer_id === applyTarget?.customer_id)
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.layby_number} (
                    {formatMoney(Number(row.total) - Number(row.amount_paid), currency)} left)
                  </option>
                ))}
            </select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setApplyTarget(null)}>
              Cancel
            </Button>
            <Button onClick={() => applyMutation.mutate()} disabled={applyMutation.isPending}>
              {applyMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
