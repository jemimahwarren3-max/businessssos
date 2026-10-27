import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, FileCheck2, Loader2, Plus, Printer, Search } from "lucide-react";
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
  addQuote,
  convertQuoteToInvoice,
  getCustomers,
  getProducts,
  getQuote,
  getQuotes,
  updateQuoteStatus,
} from "@/lib/business.functions";
import { quoteSchema, type LineItemInput } from "@/lib/business.schemas";
import { formatMoney, friendlyDate, readableError } from "@/lib/format";
import { computeTotals } from "@/lib/invoice-calc";
import { downloadXlsx } from "@/lib/xlsx-export";

export const Route = createFileRoute("/_authenticated/quotes")({
  head: () => ({
    meta: [
      { title: "Quotes | Kwetuu" },
      {
        name: "description",
        content: "Send quotations and turn accepted ones into invoices in one click.",
      },
      { property: "og:title", content: "Quotes | Kwetuu" },
      { property: "og:description", content: "Quote it, then bill it." },
    ],
  }),
  component: Quotes,
});

const NONE = "__none";

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
  validUntil: "",
  discount: "0",
  notes: "",
  terms: "",
};

function statusMeta(status: string) {
  switch (status) {
    case "draft":
      return { label: "Draft", className: "bg-muted text-muted-foreground" };
    case "sent":
      return { label: "Sent", className: "bg-info-soft text-info" };
    case "accepted":
      return { label: "Accepted", className: "bg-success-soft text-success" };
    case "declined":
      return { label: "Declined", className: "bg-danger-soft text-destructive" };
    case "expired":
      return { label: "Expired", className: "bg-muted text-muted-foreground line-through" };
    case "converted":
      return { label: "Converted", className: "bg-success-soft text-success" };
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

function Quotes() {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  const businessId = workspace.data?.business.id;
  const currency = workspace.data?.business.currency ?? "USD";
  const canManage = hasPermission(workspace.data, "quotes.manage");

  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [items, setItems] = useState<LineItemInput[]>([{ ...EMPTY_ITEM }]);
  const [activeQuoteId, setActiveQuoteId] = useState<string | null>(null);
  const [convertDueDate, setConvertDueDate] = useState("");

  const fetchQuotes = useServerFn(getQuotes);
  const fetchQuote = useServerFn(getQuote);
  const fetchCustomers = useServerFn(getCustomers);
  const fetchProducts = useServerFn(getProducts);
  const createQuoteFn = useServerFn(addQuote);
  const setStatusFn = useServerFn(updateQuoteStatus);
  const convertFn = useServerFn(convertQuoteToInvoice);

  useEffect(() => {
    if (!workspace.isLoading && workspace.data === null) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [workspace.isLoading, workspace.data, navigate]);

  const quotes = useQuery({
    queryKey: ["quotes", businessId, search],
    enabled: Boolean(businessId),
    queryFn: () => fetchQuotes({ data: { businessId: businessId!, search } }),
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
    queryKey: ["quote-detail", businessId, activeQuoteId],
    enabled: Boolean(businessId) && Boolean(activeQuoteId),
    queryFn: () => fetchQuote({ data: { businessId: businessId!, quoteId: activeQuoteId! } }),
  });

  async function invalidateAll() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["quotes"] }),
      queryClient.invalidateQueries({ queryKey: ["quote-detail"] }),
      queryClient.invalidateQueries({ queryKey: ["invoices"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
    ]);
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const parsed = quoteSchema.parse({
        businessId,
        customerId: form.customerId === NONE ? "" : form.customerId,
        issueDate: form.issueDate,
        validUntil: form.validUntil,
        notes: form.notes,
        terms: form.terms,
        discount: form.discount || 0,
        items,
      });
      return createQuoteFn({ data: parsed });
    },
    onSuccess: async (result) => {
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      setItems([{ ...EMPTY_ITEM }]);
      toast.success("Quote created as a draft.");
      await invalidateAll();
      setActiveQuoteId(result.id);
    },
    onError: (error: Error) => toast.error(readableError(error, "We couldn't create that quote.")),
  });

  const statusMutation = useMutation({
    mutationFn: (status: "sent" | "accepted" | "declined") =>
      setStatusFn({ data: { businessId: businessId!, quoteId: activeQuoteId!, status } }),
    onSuccess: async () => {
      toast.success("Quote updated.");
      await invalidateAll();
    },
    onError: (error: Error) => toast.error(readableError(error, "We couldn't update that quote.")),
  });

  const convertMutation = useMutation({
    mutationFn: () =>
      convertFn({
        data: { businessId: businessId!, quoteId: activeQuoteId!, dueDate: convertDueDate },
      }),
    onSuccess: async () => {
      toast.success("Converted to an invoice. Find it in Invoices.");
      setActiveQuoteId(null);
      setConvertDueDate("");
      await invalidateAll();
    },
    onError: (error: Error) => toast.error(readableError(error, "We couldn't convert that quote.")),
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

  const rows = quotes.data ?? [];

  function exportExcel() {
    downloadXlsx("quotes", [
      {
        name: "Quotes",
        headers: ["Number", "Customer", "Issue date", "Valid until", "Total", "Status"],
        rows: rows.map((q) => [
          q.quote_number,
          q.customer_name ?? "",
          q.issue_date,
          q.valid_until ?? "",
          q.total,
          q.status,
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
      title="Quotes"
      subtitle="Send quotations, then convert accepted ones into invoices."
      actions={
        <>
          {rows.length > 0 ? (
            <Button variant="outline" className="gap-1.5" onClick={exportExcel}>
              <Download className="size-4" aria-hidden="true" /> Export to Excel
            </Button>
          ) : null}
          {canManage ? (
            <Button
              className="gap-1.5"
              onClick={() => {
                setForm(EMPTY_FORM);
                setItems([{ ...EMPTY_ITEM }]);
                setCreateOpen(true);
              }}
            >
              <Plus className="size-4" aria-hidden="true" /> New quote
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
          placeholder="Search by quote number"
          className="pl-9"
          aria-label="Search quotes"
        />
      </div>

      <div className="surface mt-4 overflow-hidden">
        {quotes.isLoading ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <FileCheck2 className="mx-auto size-9 text-muted-foreground" aria-hidden="true" />
            <h2 className="mt-3 text-lg font-semibold">
              {search ? "No quotes match that search" : "No quotes yet"}
            </h2>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
              {search
                ? "Try a shorter search term."
                : "Send a quotation to a customer, then convert it to an invoice once they accept."}
            </p>
            {canManage && !search ? (
              <Button className="mt-5 gap-1.5" onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" aria-hidden="true" /> Create your first quote
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <ul className="divide-y divide-border lg:hidden">
              {rows.map((quote) => (
                <li key={quote.id}>
                  <button
                    type="button"
                    onClick={() => setActiveQuoteId(quote.id)}
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-4 text-left"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{quote.quote_number}</p>
                      <p className="truncate text-[13px] text-muted-foreground">
                        {quote.customer_name ?? "No customer"} ·{" "}
                        {formatMoney(quote.total, currency)}
                      </p>
                    </div>
                    <StatusBadge status={quote.status} />
                  </button>
                </li>
              ))}
            </ul>

            <table className="hidden w-full text-sm lg:table">
              <thead>
                <tr className="border-b border-border text-left text-[12px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Quote</th>
                  <th className="px-5 py-3 font-medium">Customer</th>
                  <th className="px-5 py-3 font-medium">Valid until</th>
                  <th className="px-5 py-3 font-medium">Total</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((quote) => (
                  <tr
                    key={quote.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => setActiveQuoteId(quote.id)}
                  >
                    <td className="px-5 py-3 font-medium">{quote.quote_number}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {quote.customer_name ?? "No customer"}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {quote.valid_until ? friendlyDate(quote.valid_until) : "-"}
                    </td>
                    <td className="px-5 py-3 font-medium tabular-nums">
                      {formatMoney(quote.total, currency)}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={quote.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* ----------------------------- create quote ----------------------------- */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New quote</DialogTitle>
            <DialogDescription>It's saved as a draft until you send it.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="quote-customer">Customer</Label>
              <Select
                value={form.customerId || NONE}
                onValueChange={(value) =>
                  setForm({ ...form, customerId: value === NONE ? "" : value })
                }
              >
                <SelectTrigger id="quote-customer">
                  <SelectValue placeholder="No customer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No customer</SelectItem>
                  {(customers.data ?? []).map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qt-discount">Discount ({currency})</Label>
              <Input
                id="qt-discount"
                type="number"
                min={0}
                step="0.01"
                value={form.discount}
                onChange={(e) => setForm({ ...form, discount: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qt-issue">Issue date</Label>
              <Input
                id="qt-issue"
                type="date"
                value={form.issueDate}
                onChange={(e) => setForm({ ...form, issueDate: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qt-valid">Valid until (optional)</Label>
              <Input
                id="qt-valid"
                type="date"
                value={form.validUntil}
                onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
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
              <Label htmlFor="qt-notes">Notes (optional)</Label>
              <Textarea
                id="qt-notes"
                rows={2}
                maxLength={600}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qt-terms">Terms (optional)</Label>
              <Textarea
                id="qt-terms"
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

      {/* ------------------------------ quote detail ------------------------------ */}
      <Dialog
        open={Boolean(activeQuoteId)}
        onOpenChange={(open) => !open && setActiveQuoteId(null)}
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
                  <DialogTitle>{detail.data.quote.quote_number}</DialogTitle>
                  <StatusBadge status={detail.data.quote.status} />
                </div>
                <DialogDescription>
                  {(detail.data.quote as unknown as { customers: { name: string } | null })
                    .customers?.name ?? "No customer"}{" "}
                  · Issued {friendlyDate(detail.data.quote.issue_date)}
                  {detail.data.quote.valid_until
                    ? ` · Valid until ${friendlyDate(detail.data.quote.valid_until)}`
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
                    {formatMoney(detail.data.quote.subtotal, currency)}
                  </span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Tax</span>
                  <span className="tabular-nums">
                    {formatMoney(detail.data.quote.tax, currency)}
                  </span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Discount</span>
                  <span className="tabular-nums">
                    -{formatMoney(detail.data.quote.discount, currency)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-border pt-1.5 text-base font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">
                    {formatMoney(detail.data.quote.total, currency)}
                  </span>
                </div>
              </div>

              {detail.data.quote.status === "accepted" && canManage ? (
                <div className="space-y-1.5">
                  <Label htmlFor="qt-convert-due">Invoice due date (optional)</Label>
                  <Input
                    id="qt-convert-due"
                    type="date"
                    value={convertDueDate}
                    onChange={(e) => setConvertDueDate(e.target.value)}
                  />
                </div>
              ) : null}

              {(() => {
                const joined = detail.data.quote as unknown as {
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
                      kind="quote"
                      number={detail.data.quote.quote_number}
                      issueDate={detail.data.quote.issue_date}
                      secondDateLabel="Valid until"
                      secondDate={detail.data.quote.valid_until}
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
                      subtotal={detail.data.quote.subtotal}
                      discount={detail.data.quote.discount}
                      tax={detail.data.quote.tax}
                      total={detail.data.quote.total}
                      notes={detail.data.quote.notes}
                      terms={detail.data.quote.terms}
                      currency={currency}
                    />
                  </div>
                );
              })()}

              <DialogFooter className="flex-wrap gap-2">
                <Button variant="outline" className="gap-1.5" onClick={() => window.print()}>
                  <Printer className="size-4" aria-hidden="true" /> Print
                </Button>
                {detail.data.quote.status === "draft" && canManage ? (
                  <Button
                    variant="outline"
                    onClick={() => statusMutation.mutate("sent")}
                    disabled={statusMutation.isPending}
                  >
                    Mark as sent
                  </Button>
                ) : null}
                {detail.data.quote.status === "sent" && canManage ? (
                  <>
                    <Button
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={() => statusMutation.mutate("declined")}
                      disabled={statusMutation.isPending}
                    >
                      Mark declined
                    </Button>
                    <Button
                      onClick={() => statusMutation.mutate("accepted")}
                      disabled={statusMutation.isPending}
                    >
                      Mark accepted
                    </Button>
                  </>
                ) : null}
                {detail.data.quote.status === "accepted" && canManage ? (
                  <Button
                    className="gap-1.5"
                    onClick={() => convertMutation.mutate()}
                    disabled={convertMutation.isPending}
                  >
                    {convertMutation.isPending ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : null}
                    Convert to invoice
                  </Button>
                ) : null}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
