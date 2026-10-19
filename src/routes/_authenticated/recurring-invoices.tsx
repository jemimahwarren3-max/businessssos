import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Pause, Play, Plus, Repeat, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
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
  addRecurringInvoice,
  getCustomers,
  getProducts,
  getRecurringInvoices,
  removeRecurringInvoice,
  updateRecurringInvoiceActive,
} from "@/lib/business.functions";
import { recurringInvoiceSchema, type LineItemInput } from "@/lib/business.schemas";
import { formatMoney, friendlyDate, readableError } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/recurring-invoices")({
  head: () => ({
    meta: [
      { title: "Recurring invoices | BusinessOS AI" },
      { name: "description", content: "Invoices that generate themselves on a schedule." },
    ],
  }),
  component: RecurringInvoices,
});

const CUSTOM = "__none";
const INTERVAL_LABEL: Record<string, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

const EMPTY_ITEM: LineItemInput = {
  productId: "",
  name: "",
  quantity: 1,
  unitPrice: 0,
  taxRate: 0,
};
const EMPTY_FORM = {
  customerId: "",
  interval: "monthly",
  startDate: new Date().toISOString().slice(0, 10),
  dueDays: "14",
  discount: "0",
  notes: "",
  terms: "",
};

function RecurringInvoices() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workspace = useWorkspace();
  const businessId = workspace.data?.business.id;
  const currency = workspace.data?.business.currency ?? "USD";
  const canManage = hasPermission(workspace.data, "invoices.manage");

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [items, setItems] = useState<LineItemInput[]>([{ ...EMPTY_ITEM }]);

  const fetchRecurring = useServerFn(getRecurringInvoices);
  const fetchCustomers = useServerFn(getCustomers);
  const fetchProducts = useServerFn(getProducts);
  const createFn = useServerFn(addRecurringInvoice);
  const setActiveFn = useServerFn(updateRecurringInvoiceActive);
  const removeFn = useServerFn(removeRecurringInvoice);

  useEffect(() => {
    if (!workspace.isLoading && workspace.data === null) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [workspace.isLoading, workspace.data, navigate]);

  const templates = useQuery({
    queryKey: ["recurring-invoices", businessId],
    enabled: Boolean(businessId),
    queryFn: () => fetchRecurring({ data: { businessId: businessId! } }),
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

  const createMutation = useMutation({
    mutationFn: async () => {
      const parsed = recurringInvoiceSchema.parse({
        businessId,
        customerId: form.customerId === CUSTOM ? "" : form.customerId,
        interval: form.interval,
        startDate: form.startDate,
        dueDays: form.dueDays || 14,
        discount: form.discount || 0,
        notes: form.notes,
        terms: form.terms,
        items,
      });
      return createFn({ data: parsed });
    },
    onSuccess: async () => {
      toast.success("Recurring invoice created.");
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      setItems([{ ...EMPTY_ITEM }]);
      await queryClient.invalidateQueries({ queryKey: ["recurring-invoices", businessId] });
    },
    onError: (error: Error) =>
      toast.error(readableError(error, "Couldn't create that recurring invoice.")),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (input: { recurringInvoiceId: string; active: boolean }) =>
      setActiveFn({ data: { businessId: businessId!, ...input } }),
    onSuccess: async () =>
      queryClient.invalidateQueries({ queryKey: ["recurring-invoices", businessId] }),
    onError: (error: Error) => toast.error(readableError(error, "Couldn't update that.")),
  });

  const deleteMutation = useMutation({
    mutationFn: (recurringInvoiceId: string) =>
      removeFn({ data: { businessId: businessId!, recurringInvoiceId } }),
    onSuccess: async () => {
      toast.success("Recurring invoice deleted.");
      await queryClient.invalidateQueries({ queryKey: ["recurring-invoices", businessId] });
    },
    onError: (error: Error) => toast.error(readableError(error, "Couldn't delete that.")),
  });

  if (!workspace.data) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  const rows = templates.data ?? [];

  return (
    <AppShell
      businessName={workspace.data.business.name}
      role={workspace.data.role}
      plan={workspace.data.plan}
      isReadOnly={workspace.data.isReadOnly}
      billingEnabled={workspace.data.billingEnabled}
      title="Recurring invoices"
      subtitle="Invoices that generate themselves on a schedule, as drafts you still review before sending."
      actions={
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="gap-1.5"
            onClick={() => navigate({ to: "/invoices" })}
          >
            <ArrowLeft className="size-4" aria-hidden="true" /> Back to invoices
          </Button>
          {canManage ? (
            <Button className="gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" aria-hidden="true" /> New
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="surface overflow-hidden">
        {templates.isLoading ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Repeat className="mx-auto size-9 text-muted-foreground" aria-hidden="true" />
            <h2 className="mt-3 text-lg font-semibold">No recurring invoices yet</h2>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
              Set one up for a customer you bill on a regular schedule, rent, a subscription, a
              retainer.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => {
              const total = r.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
              return (
                <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold">
                        {r.customer_name ?? "No customer"}
                      </p>
                      <span className="inline-flex shrink-0 rounded-lg bg-muted px-2 py-0.5 text-[12px] font-medium text-muted-foreground">
                        {INTERVAL_LABEL[r.interval] ?? r.interval}
                      </span>
                      {!r.is_active ? (
                        <span className="inline-flex shrink-0 rounded-lg bg-warning-soft px-2 py-0.5 text-[12px] font-medium text-warning-foreground">
                          Paused
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                      {formatMoney(total, currency)} · next {friendlyDate(r.next_issue_date)} ·{" "}
                      {r.items.length} item{r.items.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  {canManage ? (
                    <div className="flex shrink-0 gap-1.5">
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label={r.is_active ? "Pause" : "Resume"}
                        disabled={toggleActiveMutation.isPending}
                        onClick={() =>
                          toggleActiveMutation.mutate({
                            recurringInvoiceId: r.id,
                            active: !r.is_active,
                          })
                        }
                      >
                        {r.is_active ? (
                          <Pause className="size-4" aria-hidden="true" />
                        ) : (
                          <Play className="size-4" aria-hidden="true" />
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label="Delete"
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          if (confirm("Delete this recurring invoice? This can't be undone.")) {
                            deleteMutation.mutate(r.id);
                          }
                        }}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New recurring invoice</DialogTitle>
            <DialogDescription>
              A real draft invoice gets created automatically each time this comes due, you still
              review and send it yourself.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rec-customer">Customer</Label>
              <Select
                value={form.customerId || CUSTOM}
                onValueChange={(value) =>
                  setForm({ ...form, customerId: value === CUSTOM ? "" : value })
                }
              >
                <SelectTrigger id="rec-customer">
                  <SelectValue placeholder="Choose a customer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={CUSTOM} disabled>
                    Choose a customer
                  </SelectItem>
                  {(customers.data ?? []).map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rec-interval">Repeats</Label>
              <Select
                value={form.interval}
                onValueChange={(value) => setForm({ ...form, interval: value })}
              >
                <SelectTrigger id="rec-interval">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(INTERVAL_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rec-start">First issue date</Label>
              <Input
                id="rec-start"
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rec-due">Due (days after issue)</Label>
              <Input
                id="rec-due"
                type="number"
                min={0}
                value={form.dueDays}
                onChange={(e) => setForm({ ...form, dueDays: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rec-discount">Discount ({currency})</Label>
              <Input
                id="rec-discount"
                type="number"
                min={0}
                step="0.01"
                value={form.discount}
                onChange={(e) => setForm({ ...form, discount: e.target.value })}
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
              <Label htmlFor="rec-notes">Notes (optional)</Label>
              <Textarea
                id="rec-notes"
                rows={2}
                maxLength={600}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rec-terms">Terms (optional)</Label>
              <Textarea
                id="rec-terms"
                rows={2}
                maxLength={600}
                value={form.terms}
                onChange={(e) => setForm({ ...form, terms: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={
                createMutation.isPending ||
                !form.customerId ||
                items.every((item) => !item.name.trim())
              }
              className="gap-1.5"
            >
              {createMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
