import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, Download, Upload } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ImportDialog } from "@/components/import-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkspace } from "@/hooks/use-workspace";
import { getReports, importSalesHistoryFn } from "@/lib/business.functions";
import {
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  saleHistoryImportRowSchema,
  type SaleHistoryImportRow,
} from "@/lib/business.schemas";
import { downloadCsv } from "@/lib/csv";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import type { ImportColumn } from "@/lib/spreadsheet";

const SALE_HISTORY_IMPORT_COLUMNS: ImportColumn[] = [
  { key: "saleDate", label: "Date", required: true, aliases: ["saledate"] },
  { key: "total", label: "Total", required: true, aliases: ["amount", "revenue"] },
  { key: "cost", label: "Cost", required: false, aliases: ["costofgoods", "cogs"] },
  { key: "description", label: "Description", required: false, aliases: ["notes"] },
];

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reports — BusinessOS AI" },
      {
        name: "description",
        content: "Sales, profit, expenses, inventory and customer reports for your business.",
      },
      { property: "og:title", content: "Reports — BusinessOS AI" },
      { property: "og:description", content: "See how your business is really doing." },
    ],
  }),
  component: Reports,
});

const FINANCE_ROLES = ["owner", "admin", "manager", "accountant"];
const RANGES = [
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
  { key: "90", label: "3 months" },
  { key: "365", label: "1 year" },
];

const EXPENSE_CATEGORY_LABEL = Object.fromEntries(
  EXPENSE_CATEGORIES.map((c) => [c.value, c.label]),
);
const PAYMENT_METHOD_LABEL = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m.label]));

function Reports() {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  const businessId = workspace.data?.business.id;
  const currency = workspace.data?.business.currency ?? "USD";
  const role = workspace.data?.role ?? "";
  const canView = FINANCE_ROLES.includes(role);
  const canImport = ["owner", "admin", "manager", "accountant"].includes(role);

  const [range, setRange] = useState("30");
  const [importOpen, setImportOpen] = useState(false);
  const fetchReports = useServerFn(getReports);
  const importSalesHistoryRows = useServerFn(importSalesHistoryFn);

  useEffect(() => {
    if (!workspace.isLoading && workspace.data === null) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [workspace.isLoading, workspace.data, navigate]);

  const reports = useQuery({
    queryKey: ["reports", businessId, range],
    enabled: Boolean(businessId) && canView,
    queryFn: () => fetchReports({ data: { businessId: businessId!, days: Number(range) } }),
  });

  if (!workspace.data) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (!canView) {
    return (
      <AppShell
        businessName={workspace.data.business.name}
        role={workspace.data.role}
        plan={workspace.data.plan}
        title="Reports"
        subtitle="See how your business is really doing."
      >
        <div className="surface px-6 py-16 text-center">
          <BarChart3 className="mx-auto size-9 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-semibold">Your role can't view reports</h2>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
            Ask an owner, admin or manager for access if you need to see financial reports.
          </p>
        </div>
      </AppShell>
    );
  }

  const data = reports.data;

  return (
    <AppShell
      businessName={workspace.data.business.name}
      role={workspace.data.role}
      plan={workspace.data.plan}
      title="Reports"
      subtitle="See how your business is really doing."
      actions={
        <>
          {canImport ? (
            <Button variant="outline" className="gap-1.5" onClick={() => setImportOpen(true)}>
              <Upload className="size-4" aria-hidden="true" /> Import history
            </Button>
          ) : null}
          <Tabs value={range} onValueChange={setRange}>
            <TabsList>
              {RANGES.map((r) => (
                <TabsTrigger key={r.key} value={r.key} className="text-[12px] sm:text-[13px]">
                  {r.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total sales"
          value={data ? formatMoney(data.totalSales, currency) : undefined}
        />
        <KpiCard
          label="Gross profit"
          value={data ? formatMoney(data.totalProfit, currency) : undefined}
        />
        <KpiCard
          label="Total expenses"
          value={data ? formatMoney(data.totalExpenses, currency) : undefined}
        />
        <KpiCard
          label="Net profit"
          value={data ? formatMoney(data.netProfit, currency) : undefined}
          hint={data ? `${formatPercent(data.profitMargin)} margin` : undefined}
        />
      </div>

      <section className="surface mt-4 p-5">
        <h2 className="text-lg font-semibold">Sales and profit</h2>
        <p className="text-[13px] text-muted-foreground">
          Based on completed sales in this period.
        </p>
        <div className="mt-5 h-64">
          {!data ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.series}>
                <defs>
                  <linearGradient id="reportsSalesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  width={54}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--color-border)",
                    background: "var(--color-card)",
                    fontSize: 13,
                  }}
                  formatter={(value: number) => formatMoney(Number(value), currency)}
                />
                <Area
                  type="monotone"
                  dataKey="sales"
                  name="Sales"
                  stroke="var(--color-chart-1)"
                  strokeWidth={2}
                  fill="url(#reportsSalesFill)"
                />
                <Area
                  type="monotone"
                  dataKey="profit"
                  name="Profit"
                  stroke="var(--color-chart-2)"
                  strokeWidth={2}
                  fill="none"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="surface p-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Top products</h2>
              <p className="text-[13px] text-muted-foreground">By revenue this period.</p>
            </div>
            {data && data.topProducts.length > 0 ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() =>
                  downloadCsv(
                    "top-products",
                    ["Product", "Quantity sold", "Revenue"],
                    data.topProducts.map((p) => [p.name, p.quantity, p.revenue]),
                  )
                }
              >
                <Download className="size-3.5" aria-hidden="true" /> CSV
              </Button>
            ) : null}
          </div>
          {!data ? (
            <Skeleton className="mt-4 h-40 w-full" />
          ) : data.topProducts.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No sales recorded in this period.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {data.topProducts.map((p) => (
                <li key={p.name} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="text-[13px] text-muted-foreground">
                      {formatNumber(p.quantity)} sold
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {formatMoney(p.revenue, currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="surface p-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Top customers</h2>
              <p className="text-[13px] text-muted-foreground">By purchases this period.</p>
            </div>
            {data && data.topCustomers.length > 0 ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() =>
                  downloadCsv(
                    "top-customers",
                    ["Customer", "Purchased", "Currently owes"],
                    data.topCustomers.map((c) => [c.name, c.total, c.outstanding]),
                  )
                }
              >
                <Download className="size-3.5" aria-hidden="true" /> CSV
              </Button>
            ) : null}
          </div>
          {!data ? (
            <Skeleton className="mt-4 h-40 w-full" />
          ) : data.topCustomers.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No customer sales in this period.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {data.topCustomers.map((c) => (
                <li key={c.name} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.name}</p>
                    {c.outstanding > 0 ? (
                      <p className="text-[13px] text-warning-foreground">
                        Owes {formatMoney(c.outstanding, currency)}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {formatMoney(c.total, currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="surface p-5">
          <h2 className="text-lg font-semibold">Payments received</h2>
          <p className="text-[13px] text-muted-foreground">By method, this period.</p>
          {!data ? (
            <Skeleton className="mt-4 h-32 w-full" />
          ) : data.paymentsByMethod.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No payments recorded in this period.
            </p>
          ) : (
            <ul className="mt-4 space-y-2.5 text-sm">
              {data.paymentsByMethod.map((p) => (
                <li key={p.method} className="flex justify-between">
                  <span className="text-muted-foreground">
                    {PAYMENT_METHOD_LABEL[p.method] ?? p.method}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {formatMoney(p.amount, currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="surface p-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Expenses by category</h2>
              <p className="text-[13px] text-muted-foreground">This period.</p>
            </div>
            {data && data.expensesByCategory.length > 0 ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() =>
                  downloadCsv(
                    "expenses-by-category",
                    ["Category", "Amount"],
                    data.expensesByCategory.map((e) => [
                      EXPENSE_CATEGORY_LABEL[e.category] ?? e.category,
                      e.amount,
                    ]),
                  )
                }
              >
                <Download className="size-3.5" aria-hidden="true" /> CSV
              </Button>
            ) : null}
          </div>
          {!data ? (
            <Skeleton className="mt-4 h-32 w-full" />
          ) : data.expensesByCategory.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No expenses recorded in this period.
            </p>
          ) : (
            <ul className="mt-4 space-y-2.5 text-sm">
              {data.expensesByCategory.map((e) => (
                <li key={e.category} className="flex justify-between">
                  <span className="text-muted-foreground">
                    {EXPENSE_CATEGORY_LABEL[e.category] ?? e.category}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {formatMoney(e.amount, currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="surface mt-4 p-5">
        <h2 className="text-lg font-semibold">Inventory</h2>
        <p className="text-[13px] text-muted-foreground">
          Current snapshot, not tied to the date range.
        </p>
        {!data ? (
          <Skeleton className="mt-4 h-24 w-full" />
        ) : (
          <>
            <div className="mt-4 grid gap-4 sm:grid-cols-4">
              <div>
                <p className="text-[12px] uppercase tracking-wide text-muted-foreground">
                  Cost value
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {formatMoney(data.inventory.costValue, currency)}
                </p>
              </div>
              <div>
                <p className="text-[12px] uppercase tracking-wide text-muted-foreground">
                  Retail value
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {formatMoney(data.inventory.retailValue, currency)}
                </p>
              </div>
              <div>
                <p className="text-[12px] uppercase tracking-wide text-muted-foreground">
                  Products
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {formatNumber(data.inventory.productCount)}
                </p>
              </div>
              <div>
                <p className="text-[12px] uppercase tracking-wide text-muted-foreground">
                  Low stock
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {formatNumber(data.inventory.lowStockCount)}
                </p>
              </div>
            </div>
            {data.slowProducts.length > 0 ? (
              <div className="mt-5 border-t border-border pt-4">
                <p className="text-[13px] font-medium text-muted-foreground">
                  Haven't sold in this period
                </p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {data.slowProducts.map((p) => (
                    <li
                      key={p.name}
                      className="rounded-lg bg-muted px-2.5 py-1 text-[13px] text-muted-foreground"
                    >
                      {p.name} · {formatNumber(p.stock)} in stock
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </section>

      <ImportDialog<SaleHistoryImportRow>
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import sales history"
        description="Bring in past sales for reporting — this never changes today's stock levels."
        columns={SALE_HISTORY_IMPORT_COLUMNS}
        templateFilename="sales-history-template"
        parseRow={(record, rowNumber) => {
          const result = saleHistoryImportRowSchema.safeParse({
            saleDate: record["saleDate"],
            total: record["total"],
            cost: record["cost"] || 0,
            description: record["description"],
          });
          if (!result.success) {
            return {
              rowNumber,
              ok: false,
              error: result.error.issues[0]?.message ?? "Invalid row",
            };
          }
          if (Number.isNaN(new Date(result.data.saleDate).getTime())) {
            return { rowNumber, ok: false, error: `Invalid date "${result.data.saleDate}"` };
          }
          return {
            rowNumber,
            ok: true,
            value: result.data,
            summary: `${result.data.saleDate} · ${formatMoney(result.data.total, currency)}`,
          };
        }}
        onImport={async (rows) => {
          const outcome = await importSalesHistoryRows({ data: { businessId: businessId!, rows } });
          await queryClient.invalidateQueries({ queryKey: ["reports"] });
          await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
          return outcome;
        }}
      />
    </AppShell>
  );
}

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value?: string | undefined;
  hint?: string | undefined;
}) {
  return (
    <div className="surface p-5">
      <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {value ? (
        <p className="mt-2.5 text-[26px] font-bold tracking-tight">{value}</p>
      ) : (
        <Skeleton className="mt-2.5 h-8 w-28" />
      )}
      {hint ? <p className="mt-1 text-[13px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
