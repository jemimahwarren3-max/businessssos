import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plus, Receipt, Trash2, Upload } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkspace } from "@/hooks/use-workspace";
import { addExpense, getExpenses, importExpensesFn, removeExpense } from "@/lib/business.functions";
import {
  EXPENSE_CATEGORIES,
  expenseImportRowSchema,
  expenseSchema,
  PAYMENT_METHODS,
  type ExpenseImportRow,
} from "@/lib/business.schemas";
import { formatMoney, friendlyDate, readableError } from "@/lib/format";
import type { ImportColumn } from "@/lib/spreadsheet";

const EXPENSE_IMPORT_COLUMNS: ImportColumn[] = [
  { key: "expenseDate", label: "Date", required: true, aliases: ["expensedate"] },
  { key: "category", label: "Category", required: true, aliases: [] },
  { key: "amount", label: "Amount", required: true, aliases: [] },
  { key: "description", label: "Description", required: false, aliases: ["notes"] },
  { key: "vendor", label: "Vendor", required: false, aliases: ["supplier", "payee"] },
];

export const Route = createFileRoute("/_authenticated/expenses")({
  head: () => ({
    meta: [
      { title: "Expenses — BusinessOS AI" },
      {
        name: "description",
        content: "Track rent, salaries, supplies and everything else your business spends.",
      },
      { property: "og:title", content: "Expenses — BusinessOS AI" },
      { property: "og:description", content: "Know exactly where your money goes." },
    ],
  }),
  component: Expenses,
});

const FINANCE_ROLES = ["owner", "admin", "manager", "accountant"];
const RANGES = [
  { key: "30", label: "30 days" },
  { key: "90", label: "3 months" },
  { key: "365", label: "1 year" },
];

const EMPTY_FORM = {
  category: "other" as (typeof EXPENSE_CATEGORIES)[number]["value"],
  description: "",
  amount: "",
  expenseDate: new Date().toISOString().slice(0, 10),
  method: "cash" as (typeof PAYMENT_METHODS)[number]["value"],
  vendor: "",
};

const CATEGORY_LABEL = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.value, c.label]));

function Expenses() {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  const businessId = workspace.data?.business.id;
  const currency = workspace.data?.business.currency ?? "USD";
  const role = workspace.data?.role ?? "";
  const canManage = FINANCE_ROLES.includes(role);
  const canDelete = ["owner", "admin"].includes(role);

  const [range, setRange] = useState("30");
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const fetchExpenses = useServerFn(getExpenses);
  const createExpenseFn = useServerFn(addExpense);
  const deleteExpenseFn = useServerFn(removeExpense);
  const importExpensesRows = useServerFn(importExpensesFn);

  useEffect(() => {
    if (!workspace.isLoading && workspace.data === null) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [workspace.isLoading, workspace.data, navigate]);

  const expenses = useQuery({
    queryKey: ["expenses", businessId, range],
    enabled: Boolean(businessId),
    queryFn: () => fetchExpenses({ data: { businessId: businessId!, days: Number(range) } }),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const parsed = expenseSchema.parse({ businessId, ...form, amount: form.amount || 0 });
      return createExpenseFn({ data: parsed });
    },
    onSuccess: async () => {
      setOpen(false);
      setForm(EMPTY_FORM);
      toast.success("Expense recorded.");
      await queryClient.invalidateQueries({ queryKey: ["expenses"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: Error) =>
      toast.error(readableError(error, "We couldn't record that expense.")),
  });

  const deleteMutation = useMutation({
    mutationFn: (expenseId: string) =>
      deleteExpenseFn({ data: { businessId: businessId!, expenseId } }),
    onSuccess: async () => {
      toast.success("Expense deleted.");
      await queryClient.invalidateQueries({ queryKey: ["expenses"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: Error) =>
      toast.error(readableError(error, "We couldn't delete that expense.")),
  });

  const rows = useMemo(() => expenses.data ?? [], [expenses.data]);
  const total = useMemo(() => rows.reduce((sum, e) => sum + e.amount, 0), [rows]);
  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows) map.set(row.category, (map.get(row.category) ?? 0) + row.amount);
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [rows]);

  if (!workspace.data) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  return (
    <AppShell
      businessName={workspace.data.business.name}
      role={workspace.data.role}
      plan={workspace.data.plan}
      title="Expenses"
      subtitle="Rent, salaries, supplies — everything your business spends."
      actions={
        canManage ? (
          <>
            <Button variant="outline" className="gap-1.5" onClick={() => setImportOpen(true)}>
              <Upload className="size-4" aria-hidden="true" /> Import
            </Button>
            <Button className="gap-1.5" onClick={() => setOpen(true)}>
              <Plus className="size-4" aria-hidden="true" /> Add expense
            </Button>
          </>
        ) : null
      }
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="surface p-5">
            <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
              Total spent
            </p>
            {expenses.isLoading ? (
              <Skeleton className="mt-2.5 h-8 w-28" />
            ) : (
              <p className="mt-2.5 text-[26px] font-bold tracking-tight">
                {formatMoney(total, currency)}
              </p>
            )}
            <p className="mt-1 text-[13px] text-muted-foreground">
              {RANGES.find((r) => r.key === range)?.label}
            </p>
          </div>
          <div className="surface p-5">
            <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
              Top categories
            </p>
            {expenses.isLoading ? (
              <Skeleton className="mt-2.5 h-8 w-full" />
            ) : byCategory.length === 0 ? (
              <p className="mt-2.5 text-sm text-muted-foreground">Nothing recorded yet.</p>
            ) : (
              <ul className="mt-2.5 space-y-1 text-sm">
                {byCategory.map(([category, amount]) => (
                  <li key={category} className="flex justify-between">
                    <span className="text-muted-foreground">
                      {CATEGORY_LABEL[category] ?? category}
                    </span>
                    <span className="tabular-nums font-medium">
                      {formatMoney(amount, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <Tabs
          value={range}
          onValueChange={setRange}
          className="justify-self-start sm:justify-self-end"
        >
          <TabsList>
            {RANGES.map((r) => (
              <TabsTrigger key={r.key} value={r.key} className="text-[12px] sm:text-[13px]">
                {r.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="surface mt-4 overflow-hidden">
        {expenses.isLoading ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Receipt className="mx-auto size-9 text-muted-foreground" aria-hidden="true" />
            <h2 className="mt-3 text-lg font-semibold">No expenses yet</h2>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
              Record what your business spends so your profit numbers reflect reality.
            </p>
            {canManage ? (
              <Button className="mt-5 gap-1.5" onClick={() => setOpen(true)}>
                <Plus className="size-4" aria-hidden="true" /> Add your first expense
              </Button>
            ) : null}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((expense) => (
              <li
                key={expense.id}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-5 py-3.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {CATEGORY_LABEL[expense.category] ?? expense.category}
                  </p>
                  <p className="truncate text-[13px] text-muted-foreground">
                    {friendlyDate(expense.expense_date)}
                    {expense.vendor ? ` · ${expense.vendor}` : ""}
                    {expense.description ? ` · ${expense.description}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {formatMoney(expense.amount, currency)}
                </span>
                {canDelete ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      if (confirm("Delete this expense? This can't be undone.")) {
                        deleteMutation.mutate(expense.id);
                      }
                    }}
                    aria-label="Delete expense"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                ) : (
                  <span />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add an expense</DialogTitle>
            <DialogDescription>Category, amount and date are required.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select
                value={form.category}
                onValueChange={(value) =>
                  setForm({ ...form, category: value as typeof form.category })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ex-amount">Amount ({currency})</Label>
              <Input
                id="ex-amount"
                type="number"
                min={0}
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ex-date">Date</Label>
              <Input
                id="ex-date"
                type="date"
                value={form.expenseDate}
                onChange={(e) => setForm({ ...form, expenseDate: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Payment method</Label>
              <Select
                value={form.method}
                onValueChange={(value) => setForm({ ...form, method: value as typeof form.method })}
              >
                <SelectTrigger>
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
              <Label htmlFor="ex-vendor">Vendor (optional)</Label>
              <Input
                id="ex-vendor"
                maxLength={160}
                value={form.vendor}
                onChange={(e) => setForm({ ...form, vendor: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ex-desc">Description (optional)</Label>
              <Input
                id="ex-desc"
                maxLength={240}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || Number(form.amount) <= 0}
              className="gap-1.5"
            >
              {createMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              Save expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportDialog<ExpenseImportRow>
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import expenses"
        description="Bring in past expense records from a spreadsheet."
        columns={EXPENSE_IMPORT_COLUMNS}
        templateFilename="expenses-template"
        parseRow={(record, rowNumber) => {
          const rawCategory = (record["category"] ?? "").trim().toLowerCase();
          const matched = EXPENSE_CATEGORIES.find(
            (c) => c.value === rawCategory || c.label.toLowerCase() === rawCategory,
          );
          const result = expenseImportRowSchema.safeParse({
            expenseDate: record["expenseDate"],
            category: matched?.value ?? "other",
            description: record["description"],
            amount: record["amount"],
            vendor: record["vendor"],
          });
          if (!result.success) {
            return {
              rowNumber,
              ok: false,
              error: result.error.issues[0]?.message ?? "Invalid row",
            };
          }
          const categoryNote = matched ? "" : ` (category "${record["category"]}" → Other)`;
          return {
            rowNumber,
            ok: true,
            value: result.data,
            summary: `${result.data.expenseDate} · ${CATEGORY_LABEL[result.data.category]} · ${formatMoney(result.data.amount, currency)}${categoryNote}`,
          };
        }}
        onImport={async (rows) => {
          const outcome = await importExpensesRows({ data: { businessId: businessId!, rows } });
          await queryClient.invalidateQueries({ queryKey: ["expenses"] });
          await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
          return outcome;
        }}
      />
    </AppShell>
  );
}
