import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, FileText, Loader2, Plus, Printer, Repeat, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { DocumentPrintView } from "@/components/document-print-view";
import { LineItemsEditor } from "@/components/line-items-editor";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { hasPermission, useWorkspace } from "@/hooks/use-workspace";
import {
  addInvoice,
  addPayment,
  getCustomers,
  getInvoice,
  getInvoices,
  getProducts,
  updateInvoiceStatus,
} from "@/lib/business.functions";
import { invoiceSchema, PAYMENT_METHODS, type LineItemInput } from "@/lib/business.schemas";
import { formatMoney, friendlyDate, readableError } from "@/lib/format";
import { computeTotals } from "@/lib/invoice-calc";
import { downloadXlsx } from "@/lib/xlsx-export";

export const Route = createFileRoute("/_authenticated/invoices")({
  head: () => ({
    meta: [
      { title: "Invoices | BusinessOS AI" },
      {
        name: "description",
        content: "Bill customers, track what's owed, and record payments as they come in.",
      },
      { property: "og:title", content: "Invoices | BusinessOS AI" },
      { property: "og:description", content: "Get paid, faster." },
    ],
  }),
  component: Invoices,
});

const CUSTOM = "__none";

const EMPTY_ITEM: LineItemInput = {
  productId: "",
  name: "",
  quantity: 1,
  unitPrice: 0,
  taxRate: 0,
};
const EMPTY_FORM = {
  customerId: "",
  issueDate: new Date().toISOString().slice(0, 10),
  dueDate: "",
  discount: "0",
  notes: "",
  terms: "",
};

function statusMeta(status: string, dueDate: string | null) {
  const overdue =
    (status === "sent" || status === "partially_paid") && dueDate && new Date(dueDate) < new Date();
  if (overdue) return { label: "Overdue", className: "bg-danger-soft text-destructive" };
  switch (status) {
    case "draft":
      return { label: "Draft", className: "bg-muted text-muted-foreground" };
    case "sent":
      return { label: "Sent", className: "bg-info-soft text-info" };
    case "partially_paid":
      return { label: "Partially paid", className: "bg-warning-soft text-warning-foreground" };
    case "paid":
      return { label: "Paid", className: "bg-success-soft text-success" };
    case "cancelled":
      return { label: "Cancelled", className: "bg-muted text-muted-foreground line-through" };
    default:
      return { label: status, className: "bg-muted text-muted-foreground" };
  }
}

function StatusBadge({ status, dueDate }: { status: string; dueDate: string | null }) {
  const meta = statusMeta(status, dueDate);
  return (
    <span
      className={`inline-flex shrink-0 rounded-lg px-2.5 py-1 text-[13px] font-semibold ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

function Invoices() {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  const businessId = workspace.data?.business.id;
  const currency = workspace.data?.business.currency ?? "USD";
  const canCreate = hasPermission(workspace.data, "invoices.manage");
  const canRecordPayment = hasPermission(workspace.data, "payments.record");

  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [items, setItems] = useState<LineItemInput[]>([{ ...EMPTY_ITEM }]);
  const [activeInvoiceId, setActiveInvoiceId] = useState<string | null>(null);
  // Rotates each time the create dialog is opened; stays fixed across a
  // failed submit within the same open session so a retry can't double-book.
  const [createKey, setCreateKey] = useState(() => crypto.randomUUID());
  const [payment, setPayment] = useState<{
    amount: string;
    method: string;
    reference: string;
    key: string;
  } | null>(null);

  const fetchInvoices = useServerFn(getInvoices);
  const fetchInvoice = useServerFn(getInvoice);
  const fetchCustomers = useServerFn(getCustomers);
  const fetchProducts = useServerFn(getProducts);
  const createInvoiceFn = useServerFn(addInvoice);
  const setStatusFn = useServerFn(updateInvoiceStatus);
  const recordPaymentFn = useServerFn(addPayment);

  useEffect(() => {
    if (!workspace.isLoading && workspace.data === null) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [workspace.isLoading, workspace.data, navigate]);

  const invoices = useQuery({
    queryKey: ["invoices", businessId, search],
    enabled: Boolean(businessId),
    queryFn: () => fetchInvoices({ data: { businessId: businessId!, search } }),
  });

  const customers = useQuery({
    queryKey: ["customers", businessId, ""],
    enabled: Boolean(businessId) && createOpen,
    queryFn: () => fetchCustomers({ data: { businessId: businessId!, search: "" } }),
  });

  const products = useQuery({
    queryKey: ["products", businessId, ""],
    enabled: Boolean(businessId) && createOpen,
    queryFn: () => fetchProducts({ data: { businessId: businessId!, search: "" } }),
  });

  const detail = useQuery({
    queryKey: ["invoice-detail", businessId, activeInvoiceId],
    enabled: Boolean(businessId) && Boolean(activeInvoiceId),
    queryFn: () => fetchInvoice({ data: { businessId: businessId!, invoiceId: activeInvoiceId! } }),
  });

  async function invalidateAll() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["invoices"] }),
      queryClient.invalidateQueries({ queryKey: ["invoice-detail"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      queryClient.invalidateQueries({ queryKey: ["customers"] }),
    ]);
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const parsed = invoiceSchema.parse({
        businessId,
        customerId: form.customerId === CUSTOM ? "" : form.customerId,
        issueDate: form.issueDate,
        dueDate: form.dueDate,
        notes: form.notes,
        terms: form.terms,
        discount: form.discount || 0,
        items,
        idempotencyKey: createKey,
      });
      return createInvoiceFn({ data: parsed });
    },
    onSuccess: async (result) => {
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      setItems([{ ...EMPTY_ITEM }]);
      toast.success("Invoice created as a draft.");
      await invalidateAll();
      setActiveInvoiceId(result.id);
    },
    onError: (error: Error) =>
      toast.error(readableError(error, "We couldn't create that invoice.")),
  });

  const statusMutation = useMutation({
    mutationFn: (status: "sent" | "cancelled") =>
      setStatusFn({ data: { businessId: businessId!, invoiceId: activeInvoiceId!, status } }),
    onSuccess: async (_data, status) => {
      toast.success(status === "sent" ? "Invoice sent." : "Invoice cancelled.");
      await invalidateAll();
    },
    onError: (error: Error) =>
      toast.error(readableError(error, "We couldn't update that invoice.")),
  });

  const paymentMutation = useMutation({
    mutationFn: () =>
      recordPaymentFn({
        data: {
          businessId: businessId!,
          invoiceId: activeInvoiceId!,
          amount: Number(payment?.amount || 0),
          method: (payment?.method ?? "cash") as never,
          reference: payment?.reference ?? "",
          idempotencyKey: payment!.key,
        },
      }),
    onSuccess: async () => {
      toast.success("Payment recorded.");
      setPayment(null);
      await invalidateAll();
    },
    onError: (error: Error) =>
      toast.error(readableError(error, "We couldn't record that payment.")),
  });

  const totals = useMemo(
    () => computeTotals(items, Number(form.discount) || 0),
    [items, form.discount],
  );

  if (!workspace.data) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  const rows = invoices.data ?? [];
  const balanceDue = detail.data
    ? Number(detail.data.invoice.total) - Number(detail.data.invoice.amount_paid)
    : 0;

  function exportExcel() {
    downloadXlsx("invoices", [
      {
        name: "Invoices",
        headers: ["Number", "Customer", "Issue date", "Due date", "Total", "Paid", "Status"],
        rows: rows.map((inv) => [
          inv.invoice_number,
          inv.customer_name ?? "",
          inv.issue_date,
          inv.due_date ?? "",
          inv.total,
          inv.amount_paid,
          inv.status,
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
      title="Invoices"
      subtitle="Bill customers and keep track of who's paid."
      actions={
        <>
          <Button
            variant="outline"
            className="gap-1.5"
            onClick={() => navigate({ to: "/recurring-invoices" })}
          >
            <Repeat className="size-4" aria-hidden="true" /> Recurring
          </Button>
          {rows.length > 0 ? (
            <Button variant="outline" className="gap-1.5" onClick={exportExcel}>
              <Download className="size-4" aria-hidden="true" /> Export to Excel
            </Button>
          ) : null}
          {canCreate ? (
            <Button
              className="gap-1.5"
              onClick={() => {
                setForm(EMPTY_FORM);
                setItems([{ ...EMPTY_ITEM }]);
                setCreateKey(crypto.randomUUID());
                setCreateOpen(true);
              }}
            >
              <Plus className="size-4" aria-hidden="true" /> New invoice
            </Button>
          ) : null}
        </>
      }
    >
      <div className="relative max-w-sm">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by invoice number"
          className="pl-9"
          aria-label="Search invoices"
        />
      </div>

      <div className="surface mt-4 overflow-hidden">
        {invoices.isLoading ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <FileText className="mx-auto size-9 text-muted-foreground" aria-hidden="true" />
            <h2 className="mt-3 text-lg font-semibold">
              {search ? "No invoices match that search" : "No invoices yet"}
            </h2>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
              {search
                ? "Try a shorter search term."
                : "Create your first invoice to start billing customers and tracking what they owe."}
            </p>
            {canCreate && !search ? (
              <Button
                className="mt-5 gap-1.5"
                onClick={() => {
                  setCreateKey(crypto.randomUUID());
                  setCreateOpen(true);
                }}
              >
                <Plus className="size-4" aria-hidden="true" /> Create your first invoice
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <ul className="divide-y divide-border lg:hidden">
              {rows.map((invoice) => (
                <li key={invoice.id}>
                  <button
                    type="button"
                    onClick={() => setActiveInvoiceId(invoice.id)}
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-4 text-left"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{invoice.invoice_number}</p>
                      <p className="truncate text-[13px] text-muted-foreground">
                        {invoice.customer_name ?? "No customer"} ·{" "}
                        {formatMoney(invoice.total, currency)}
                      </p>
                    </div>
                    <StatusBadge status={invoice.status} dueDate={invoice.due_date} />
                  </button>
                </li>
              ))}
            </ul>

            <table className="hidden w-full text-sm lg:table">
              <thead>
                <tr className="border-b border-border text-left text-[12px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Invoice</th>
                  <th className="px-5 py-3 font-medium">Customer</th>
                  <th className="px-5 py-3 font-medium">Due</th>
                  <th className="px-5 py-3 font-medium">Total</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => setActiveInvoiceId(invoice.id)}
                  >
                    <td className="px-5 py-3 font-medium">{invoice.invoice_number}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {invoice.customer_name ?? "No customer"}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {invoice.due_date ? friendlyDate(invoice.due_date) : "-"}
                    </td>
                    <td className="px-5 py-3 font-medium tabular-nums">
                      {formatMoney(invoice.total, currency)}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={invoice.status} dueDate={invoice.due_date} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* ---------------------------- create invoice ---------------------------- */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New invoice</DialogTitle>
            <DialogDescription>It's saved as a draft until you send it.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="invoice-customer">Customer</Label>
              <Select
                value={form.customerId || CUSTOM}
                onValueChange={(value) =>
                  setForm({ ...form, customerId: value === CUSTOM ? "" : value })
                }
              >
                <SelectTrigger id="invoice-customer">
                  <SelectValue placeholder="No customer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={CUSTOM}>No customer</SelectItem>
                  {(customers.data ?? []).map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-discount">Discount ({currency})</Label>
              <Input
                id="inv-discount"
                type="number"
                min={0}
                step="0.01"
                value={form.discount}
                onChange={(e) => setForm({ ...form, discount: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-issue">Issue date</Label>
              <Input
                id="inv-issue"
                type="date"
                value={form.issueDate}
                onChange={(e) => setForm({ ...form, issueDate: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-due">Due date (optional)</Label>
              <Input
                id="inv-due"
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Items</Label>
            <LineItemsEditor
              items={items}
              onChange={setItems}
              products={(products.data ?? []).map((p) => ({
                id: p.id,
                name: p.name,
                price: Number(p.selling_price),
                tax_rate: Number(p.tax_rate),
              }))}
              currency={currency}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="inv-notes">Notes (optional)</Label>
              <Textarea
                id="inv-notes"
                rows={2}
                maxLength={600}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-terms">Terms (optional)</Label>
              <Textarea
                id="inv-terms"
                rows={2}
                maxLength={600}
                value={form.terms}
                onChange={(e) => setForm({ ...form, terms: e.target.value })}
              />
            </div>
          </div>

          <div className="surface space-y-1.5 p-4 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatMoney(totals.subtotal, currency)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Tax</span>
              <span className="tabular-nums">{formatMoney(totals.tax, currency)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Discount</span>
              <span className="tabular-nums">
                -{formatMoney(Number(form.discount) || 0, currency)}
              </span>
            </div>
            <div className="flex justify-between border-t border-border pt-1.5 text-base font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatMoney(totals.total, currency)}</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || items.every((item) => !item.name.trim())}
              className="gap-1.5"
            >
              {createMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              Save draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------ invoice detail ------------------------------ */}
      <Dialog
        open={Boolean(activeInvoiceId)}
        onOpenChange={(open) => !open && setActiveInvoiceId(null)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          {!detail.data ? (
            <div className="space-y-3 py-6">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <DialogTitle>{detail.data.invoice.invoice_number}</DialogTitle>
                  <StatusBadge
                    status={detail.data.invoice.status}
                    dueDate={detail.data.invoice.due_date}
                  />
                </div>
                <DialogDescription>
                  {(detail.data.invoice as unknown as { customers: { name: string } | null })
                    .customers?.name ?? "No customer"}{" "}
                  · Issued {friendlyDate(detail.data.invoice.issue_date)}
                  {detail.data.invoice.due_date
                    ? ` · Due ${friendlyDate(detail.data.invoice.due_date)}`
                    : ""}
                </DialogDescription>
              </DialogHeader>

              <ul className="divide-y divide-border rounded-lg border border-border">
                {detail.data.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate">
                      {item.name} <span className="text-muted-foreground">× {item.quantity}</span>
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {formatMoney(item.line_total, currency)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="surface space-y-1.5 p-4 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="tabular-nums">
                    {formatMoney(detail.data.invoice.subtotal, currency)}
                  </span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Tax</span>
                  <span className="tabular-nums">
                    {formatMoney(detail.data.invoice.tax, currency)}
                  </span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Discount</span>
                  <span className="tabular-nums">
                    -{formatMoney(detail.data.invoice.discount, currency)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-border pt-1.5 text-base font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">
                    {formatMoney(detail.data.invoice.total, currency)}
                  </span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Paid</span>
                  <span className="tabular-nums">
                    {formatMoney(detail.data.invoice.amount_paid, currency)}
                  </span>
                </div>
                {balanceDue > 0 && detail.data.invoice.status !== "cancelled" ? (
                  <div className="flex justify-between font-semibold text-warning-foreground">
                    <span>Balance due</span>
                    <span className="tabular-nums">{formatMoney(balanceDue, currency)}</span>
                  </div>
                ) : null}
              </div>

              {detail.data.payments.length > 0 ? (
                <div>
                  <p className="mb-1.5 text-[13px] font-medium text-muted-foreground">Payments</p>
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {detail.data.payments.map((p) => (
                      <li key={p.id} className="flex justify-between px-3 py-2 text-sm">
                        <span className="text-muted-foreground">
                          {friendlyDate(p.paid_at)} · {p.method.replace("_", " ")}
                        </span>
                        <span className="tabular-nums font-medium">
                          {formatMoney(p.amount, currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {(() => {
                const joined = detail.data.invoice as unknown as {
                  customers: { name: string; phone: string | null; email: string | null } | null;
                  businesses: {
                    name: string;
                    address: string | null;
                    phone: string | null;
                    email: string | null;
                  } | null;
                };
                return (
                  <div className="hidden print:block print-area">
                    <DocumentPrintView
                      kind="invoice"
                      number={detail.data.invoice.invoice_number}
                      issueDate={detail.data.invoice.issue_date}
                      secondDateLabel="Due"
                      secondDate={detail.data.invoice.due_date}
                      business={
                        joined.businesses ?? {
                          name: workspace.data!.business.name,
                          address: null,
                          phone: null,
                          email: null,
                        }
                      }
                      customer={joined.customers}
                      items={detail.data.items}
                      subtotal={detail.data.invoice.subtotal}
                      discount={detail.data.invoice.discount}
                      tax={detail.data.invoice.tax}
                      total={detail.data.invoice.total}
                      amountPaid={detail.data.invoice.amount_paid}
                      notes={detail.data.invoice.notes}
                      terms={detail.data.invoice.terms}
                      currency={currency}
                    />
                  </div>
                );
              })()}

              <DialogFooter className="flex-wrap gap-2 sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" className="gap-1.5" onClick={() => window.print()}>
                    <Printer className="size-4" aria-hidden="true" /> Print
                  </Button>
                  {detail.data.invoice.status === "draft" && canCreate ? (
                    <Button
                      variant="outline"
                      onClick={() => statusMutation.mutate("sent")}
                      disabled={statusMutation.isPending}
                    >
                      Mark as sent
                    </Button>
                  ) : null}
                  {["sent", "partially_paid"].includes(detail.data.invoice.status) && canCreate ? (
                    <Button
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm("Cancel this invoice? This can't be undone.")) {
                          statusMutation.mutate("cancelled");
                        }
                      }}
                      disabled={statusMutation.isPending}
                    >
                      Cancel invoice
                    </Button>
                  ) : null}
                </div>
                {["sent", "partially_paid"].includes(detail.data.invoice.status) &&
                canRecordPayment ? (
                  <Button
                    className="gap-1.5"
                    onClick={() =>
                      setPayment({
                        amount: balanceDue.toFixed(2),
                        method: "cash",
                        reference: "",
                        key: crypto.randomUUID(),
                      })
                    }
                  >
                    Record payment
                  </Button>
                ) : null}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ------------------------------ record payment ------------------------------ */}
      <Dialog open={Boolean(payment)} onOpenChange={(open) => !open && setPayment(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
            <DialogDescription>Balance due: {formatMoney(balanceDue, currency)}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="pay-amount">Amount ({currency})</Label>
              <Input
                id="pay-amount"
                type="number"
                min={0}
                step="0.01"
                value={payment?.amount ?? ""}
                onChange={(e) => setPayment((p) => (p ? { ...p, amount: e.target.value } : p))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invoice-payment-method">Payment method</Label>
              <Select
                value={payment?.method ?? "cash"}
                onValueChange={(value) => setPayment((p) => (p ? { ...p, method: value } : p))}
              >
                <SelectTrigger id="invoice-payment-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-ref">Reference (optional)</Label>
              <Input
                id="pay-ref"
                maxLength={120}
                value={payment?.reference ?? ""}
                onChange={(e) => setPayment((p) => (p ? { ...p, reference: e.target.value } : p))}
                placeholder="Transaction ID, cheque number…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPayment(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => paymentMutation.mutate()}
              disabled={paymentMutation.isPending || Number(payment?.amount) <= 0}
              className="gap-1.5"
            >
              {paymentMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              Save payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
