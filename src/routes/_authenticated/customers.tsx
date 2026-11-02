import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  BookOpen,
  Download,
  Loader2,
  MessageCircle,
  Plus,
  Search,
  Upload,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ImportDialog } from "@/components/import-dialog";
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
import { LineItemsEditor } from "@/components/line-items-editor";
import { hasPermission, useWorkspace } from "@/hooks/use-workspace";
import { useDebounce } from "@/hooks/use-debounce";
import {
  addCreditPayment,
  addCustomer,
  addCustomerDeposit,
  addQuote,
  getCustomers,
  getProducts,
  importCustomersFn,
} from "@/lib/business.functions";
import {
  creditPaymentSchema,
  customerDepositSchema,
  customerImportRowSchema,
  customerSchema,
  quoteSchema,
  type CustomerImportRow,
  type LineItemInput,
} from "@/lib/business.schemas";
import { formatMoney, friendlyDate, readableError } from "@/lib/format";
import { CREDIT_REPAYMENT_RAILS, railToPaymentMethod } from "@/lib/payment-rails";
import { computeTotals } from "@/lib/invoice-calc";
import type { ImportColumn } from "@/lib/spreadsheet";
import { buildQuoteWhatsAppMessage, buildWhatsAppLink } from "@/lib/whatsapp";
import { downloadXlsx } from "@/lib/xlsx-export";

const CUSTOMER_IMPORT_COLUMNS: ImportColumn[] = [
  { key: "name", label: "Name", required: true, aliases: ["customer", "contactname", "fullname"] },
  { key: "phone", label: "Phone", required: false, aliases: ["mobile", "cell", "contactnumber"] },
  { key: "email", label: "Email", required: false, aliases: [] },
  { key: "address", label: "Address", required: false, aliases: [] },
  { key: "notes", label: "Notes", required: false, aliases: [] },
];

const EMPTY_ITEM: LineItemInput = {
  productId: "",
  name: "",
  quantity: 1,
  unitPrice: 0,
  taxRate: 0,
};

export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({
    meta: [
      { title: "Customers | Kwetuu" },
      {
        name: "description",
        content: "Your customer directory with contact details and outstanding balances.",
      },
      { property: "og:title", content: "Customers | Kwetuu" },
      { property: "og:description", content: "Know who buys from you and who owes you." },
    ],
  }),
  component: Customers,
});

type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  outstanding_balance: number;
  last_paid_at: string | null;
};

const EMPTY = { name: "", phone: "", email: "", address: "", notes: "" };

function Customers() {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  const businessId = workspace.data?.business.id;
  const currency = workspace.data?.business.currency ?? "USD";
  const businessName = workspace.data?.business.name ?? "";
  const canOrder = hasPermission(workspace.data, "customers.order");
  const canPay = hasPermission(workspace.data, "payments.record");
  const [bookOnly, setBookOnly] = useState(false);
  const [payTarget, setPayTarget] = useState<CustomerRow | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payRail, setPayRail] = useState("cash");
  const [payReference, setPayReference] = useState("");
  const [depositTarget, setDepositTarget] = useState<CustomerRow | null>(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositRail, setDepositRail] = useState("cash");
  const [depositReference, setDepositReference] = useState("");

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [orderTarget, setOrderTarget] = useState<CustomerRow | null>(null);
  const [orderItems, setOrderItems] = useState<LineItemInput[]>([{ ...EMPTY_ITEM }]);

  const fetchCustomers = useServerFn(getCustomers);
  const createCustomer = useServerFn(addCustomer);
  const fetchProducts = useServerFn(getProducts);
  const createQuoteFn = useServerFn(addQuote);
  const importCustomersRows = useServerFn(importCustomersFn);
  const recordCreditFn = useServerFn(addCreditPayment);
  const takeDepositFn = useServerFn(addCustomerDeposit);

  useEffect(() => {
    if (!workspace.isLoading && workspace.data === null) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [workspace.isLoading, workspace.data, navigate]);

  const customers = useQuery({
    queryKey: ["customers", businessId, debouncedSearch],
    enabled: Boolean(businessId),
    queryFn: () => fetchCustomers({ data: { businessId: businessId!, search: debouncedSearch } }),
  });

  const orderProducts = useQuery({
    queryKey: ["products", businessId, ""],
    enabled: Boolean(businessId) && Boolean(orderTarget),
    queryFn: () => fetchProducts({ data: { businessId: businessId!, search: "" } }),
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const parsed = customerSchema.parse({ businessId, ...form });
      return createCustomer({ data: parsed });
    },
    onSuccess: async () => {
      setOpen(false);
      setForm(EMPTY);
      toast.success("Customer added.");
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (error: Error) => toast.error(error.message || "We couldn't add that customer."),
  });

  const orderMutation = useMutation({
    mutationFn: async () => {
      const parsed = quoteSchema.parse({
        businessId,
        customerId: orderTarget!.id,
        issueDate: new Date().toISOString().slice(0, 10),
        discount: 0,
        items: orderItems,
      });
      return createQuoteFn({ data: parsed });
    },
    onSuccess: async () => {
      const totals = computeTotals(orderItems, 0);
      const message = buildQuoteWhatsAppMessage(
        orderTarget!.name,
        businessName,
        orderItems,
        totals,
        currency,
      );
      const link = buildWhatsAppLink(orderTarget!.phone, message);
      setOrderTarget(null);
      setOrderItems([{ ...EMPTY_ITEM }]);
      await queryClient.invalidateQueries({ queryKey: ["quotes"] });
      if (link) {
        toast.success("Quote created. Opening WhatsApp…");
        window.open(link, "_blank", "noopener,noreferrer");
      } else {
        toast.success("Quote created, but this customer has no phone on file to message.");
      }
    },
    onError: (error: Error) => toast.error(readableError(error, "We couldn't create that order.")),
  });

  const payMutation = useMutation({
    mutationFn: async () => {
      const parsed = creditPaymentSchema.parse({
        businessId,
        customerId: payTarget!.id,
        amount: payAmount,
        method: railToPaymentMethod(payRail),
        rail: payRail,
        reference: payReference,
        idempotencyKey: crypto.randomUUID(),
      });
      return recordCreditFn({ data: parsed });
    },
    onSuccess: async () => {
      toast.success("Repayment recorded.");
      setPayTarget(null);
      setPayAmount("");
      setPayReference("");
      setPayRail("cash");
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["daily-takings"] });
      await queryClient.invalidateQueries({ queryKey: ["cash-drawer"] });
    },
    onError: (error: Error) =>
      toast.error(readableError(error, "We couldn't record that repayment.")),
  });

  const depositMutation = useMutation({
    mutationFn: async () => {
      const parsed = customerDepositSchema.parse({
        businessId,
        customerId: depositTarget!.id,
        amount: depositAmount,
        method: railToPaymentMethod(depositRail),
        rail: depositRail,
        reference: depositReference,
        idempotencyKey: crypto.randomUUID(),
      });
      return takeDepositFn({ data: parsed });
    },
    onSuccess: async () => {
      toast.success("Deposit held. Apply it to credit or a lay-by from Lay-by.");
      setDepositTarget(null);
      setDepositAmount("");
      setDepositReference("");
      setDepositRail("cash");
      await queryClient.invalidateQueries({ queryKey: ["customer-deposits"] });
      await queryClient.invalidateQueries({ queryKey: ["daily-takings"] });
      await queryClient.invalidateQueries({ queryKey: ["cash-drawer"] });
    },
    onError: (error: Error) => toast.error(readableError(error, "We couldn't take that deposit.")),
  });

  if (!workspace.data) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  const allRows = (customers.data ?? []) as CustomerRow[];
  const rows = bookOnly
    ? allRows
        .filter((row) => Number(row.outstanding_balance ?? 0) > 0)
        .sort((a, b) => Number(b.outstanding_balance) - Number(a.outstanding_balance))
    : allRows;

  function exportExcel() {
    downloadXlsx("customers", [
      {
        name: "Customers",
        headers: ["Name", "Phone", "Email", "Outstanding balance"],
        rows: rows.map((c) => [c.name, c.phone ?? "", c.email ?? "", c.outstanding_balance]),
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
      title="Customers"
      subtitle="Your customer directory and the credit book of who still owes you money."
      actions={
        <>
          {rows.length > 0 ? (
            <Button variant="outline" className="gap-1.5" onClick={exportExcel}>
              <Download className="size-4" aria-hidden="true" /> Export to Excel
            </Button>
          ) : null}
          <Button variant="outline" className="gap-1.5" onClick={() => setImportOpen(true)}>
            <Upload className="size-4" aria-hidden="true" /> Import
          </Button>
          <Button className="gap-1.5" onClick={() => setOpen(true)}>
            <Plus className="size-4" aria-hidden="true" /> Add customer
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone or email"
            className="pl-9"
            aria-label="Search customers"
          />
        </div>
        <Button
          type="button"
          variant={bookOnly ? "default" : "outline"}
          className="gap-1.5"
          onClick={() => setBookOnly((value) => !value)}
        >
          <BookOpen className="size-4" aria-hidden="true" />
          {bookOnly ? "Showing credit book" : "Credit book"}
        </Button>
      </div>

      <div className="surface mt-4 overflow-hidden">
        {customers.isLoading ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Users className="mx-auto size-9 text-muted-foreground" aria-hidden="true" />
            <h2 className="mt-3 text-lg font-semibold">
              {search ? "No customers match that search" : "No customers yet"}
            </h2>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
              {search
                ? "Try a shorter search term."
                : bookOnly
                  ? "Nobody is on the credit book right now."
                  : "Add the people who buy from you so you can track credit, invoices and repeat sales."}
            </p>
            {!search ? (
              <Button className="mt-5 gap-1.5" onClick={() => setOpen(true)}>
                <Plus className="size-4" aria-hidden="true" /> Add your first customer
              </Button>
            ) : null}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((customer) => {
              const owed = Number(customer.outstanding_balance ?? 0);
              return (
                <li
                  key={customer.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{customer.name}</p>
                    <p className="truncate text-[13px] text-muted-foreground">
                      {customer.phone || customer.email || "No contact details"}
                      {customer.last_paid_at
                        ? ` · Last paid ${friendlyDate(customer.last_paid_at)}`
                        : ""}
                    </p>
                  </div>
                  <span
                    className={
                      owed > 0
                        ? "shrink-0 rounded-lg bg-warning-soft px-2.5 py-1 text-[13px] font-semibold tabular-nums text-warning-foreground"
                        : "shrink-0 text-[13px] text-muted-foreground"
                    }
                  >
                    {owed > 0 ? `Owes ${formatMoney(owed, currency)}` : "Settled"}
                  </span>
                  <div className="col-span-2 flex flex-wrap justify-end gap-2 sm:col-span-1">
                    {canPay ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        onClick={() => {
                          setDepositAmount("");
                          setDepositRail("cash");
                          setDepositReference("");
                          setDepositTarget(customer);
                        }}
                      >
                        Take deposit
                      </Button>
                    ) : null}
                    {canPay && owed > 0 ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        onClick={() => {
                          setPayAmount(String(owed));
                          setPayRail("cash");
                          setPayReference("");
                          setPayTarget(customer);
                        }}
                      >
                        Record payment
                      </Button>
                    ) : null}
                    {canOrder ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 gap-1.5"
                        onClick={() => {
                          setOrderItems([{ ...EMPTY_ITEM }]);
                          setOrderTarget(customer);
                        }}
                      >
                        <MessageCircle className="size-3.5" aria-hidden="true" /> Order
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add a customer</DialogTitle>
            <DialogDescription>Only the name is required.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="c-name">Full name</Label>
              <Input
                id="c-name"
                value={form.name}
                maxLength={160}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Tendai Moyo"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-phone">Phone</Label>
              <Input
                id="c-phone"
                value={form.phone}
                maxLength={40}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-email">Email</Label>
              <Input
                id="c-email"
                type="email"
                value={form.email}
                maxLength={200}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="c-address">Address</Label>
              <Input
                id="c-address"
                value={form.address}
                maxLength={240}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="c-notes">Notes</Label>
              <Textarea
                id="c-notes"
                rows={2}
                maxLength={600}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || form.name.trim().length === 0}
              className="gap-1.5"
            >
              {mutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              Save customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(orderTarget)} onOpenChange={(next) => !next && setOrderTarget(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Order for {orderTarget?.name}</DialogTitle>
            <DialogDescription>
              Add what they're buying, this creates a quote and opens WhatsApp with it pre-filled,
              using their phone number on file.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Items</Label>
            <LineItemsEditor
              items={orderItems}
              onChange={setOrderItems}
              products={(orderProducts.data ?? []).map((p) => ({
                id: p.id,
                name: p.name,
                price: Number(p.selling_price),
                tax_rate: Number(p.tax_rate),
              }))}
              currency={currency}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOrderTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => orderMutation.mutate()}
              disabled={orderMutation.isPending || orderItems.every((item) => !item.name.trim())}
              className="gap-1.5"
            >
              {orderMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <MessageCircle className="size-4" aria-hidden="true" />
              )}
              Create quote &amp; message
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
            <DialogTitle>Record a repayment</DialogTitle>
            <DialogDescription>
              {payTarget
                ? `${payTarget.name} owes ${formatMoney(Number(payTarget.outstanding_balance), currency)}. This writes a payment and reduces the credit book. It does not confirm EcoCash or bank money arrived.`
                : "Record a repayment."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="credit-amount">Amount</Label>
              <Input
                id="credit-amount"
                inputMode="decimal"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="credit-rail">How they paid</Label>
              <select
                id="credit-rail"
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
              <Label htmlFor="credit-ref">Reference (optional)</Label>
              <Input
                id="credit-ref"
                value={payReference}
                maxLength={120}
                onChange={(e) => setPayReference(e.target.value)}
                placeholder="EcoCash or bank reference"
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
              className="gap-1.5"
            >
              {payMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              Save repayment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(depositTarget)}
        onOpenChange={(next) => {
          if (!next) setDepositTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Take a deposit</DialogTitle>
            <DialogDescription>
              {depositTarget
                ? `Hold money from ${depositTarget.name} without creating a sale or invoice. Apply it later to credit or a lay-by.`
                : "Take a deposit."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="deposit-amount">Amount</Label>
              <Input
                id="deposit-amount"
                inputMode="decimal"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deposit-rail">How they paid</Label>
              <select
                id="deposit-rail"
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={depositRail}
                onChange={(e) => setDepositRail(e.target.value)}
              >
                {CREDIT_REPAYMENT_RAILS.map((rail) => (
                  <option key={rail.value} value={rail.value}>
                    {rail.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deposit-ref">Reference (optional)</Label>
              <Input
                id="deposit-ref"
                value={depositReference}
                maxLength={120}
                onChange={(e) => setDepositReference(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDepositTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => depositMutation.mutate()}
              disabled={depositMutation.isPending || Number(depositAmount) <= 0}
            >
              {depositMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              Hold deposit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportDialog<CustomerImportRow>
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import customers"
        description="Bring in a customer list from a spreadsheet, only the name is required."
        columns={CUSTOMER_IMPORT_COLUMNS}
        templateFilename="customers-template"
        parseRow={(record, rowNumber) => {
          const result = customerImportRowSchema.safeParse({
            name: record["name"],
            phone: record["phone"],
            email: record["email"],
            address: record["address"],
            notes: record["notes"],
          });
          if (!result.success) {
            return {
              rowNumber,
              ok: false,
              error: result.error.issues[0]?.message ?? "Invalid row",
            };
          }
          return {
            rowNumber,
            ok: true,
            value: result.data,
            summary: `${result.data.name}${result.data.phone ? `, ${result.data.phone}` : ""}`,
          };
        }}
        onImport={async (rows) => {
          const outcome = await importCustomersRows({ data: { businessId: businessId!, rows } });
          await queryClient.invalidateQueries({ queryKey: ["customers"] });
          return outcome;
        }}
      />
    </AppShell>
  );
}
