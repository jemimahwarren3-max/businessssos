import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { DataExportPrintView } from "@/components/data-export-print-view";
import { Skeleton } from "@/components/ui/skeleton";
import { hasPermission, useWorkspace } from "@/hooks/use-workspace";
import { exportBusinessDataFn } from "@/lib/business.functions";
import { readableError } from "@/lib/format";
import { downloadXlsx } from "@/lib/xlsx-export";

export const Route = createFileRoute("/_authenticated/settings/data")({
  head: () => ({
    meta: [{ title: "Export data | BusinessOS AI" }],
  }),
  component: DataExport,
});

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function toCell(value: unknown): string | number {
  if (typeof value === "number") return value;
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function toSheet(name: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return null;
  const headers = Object.keys(rows[0]!);
  return {
    name: name.slice(0, 31),
    headers,
    rows: rows.map((row) => headers.map((h) => toCell(row[h]))),
  };
}

async function downloadExcel(filename: string, data: Record<string, unknown>) {
  const sheets = [];
  const business = data["business"];
  if (business && typeof business === "object") {
    sheets.push(toSheet("Business", [business as Record<string, unknown>]));
  }
  for (const [key, value] of Object.entries(data)) {
    if (key === "business" || key === "exportedAt") continue;
    if (Array.isArray(value)) sheets.push(toSheet(key, value as Record<string, unknown>[]));
  }
  const nonEmpty = sheets.filter((s): s is NonNullable<typeof s> => s !== null);
  if (nonEmpty.length === 0) {
    toast.error("There's no data yet to export.");
    return;
  }
  await downloadXlsx(filename, nonEmpty);
}

function DataExport() {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const businessId = workspace.data?.business.id;
  const canExport = hasPermission(workspace.data, "business.export_data");
  const [printData, setPrintData] = useState<Record<string, unknown> | null>(null);

  const exportData = useServerFn(exportBusinessDataFn);

  useEffect(() => {
    if (!workspace.isLoading && workspace.data === null) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [workspace.isLoading, workspace.data, navigate]);

  // The print view has to actually be in the DOM before window.print() can
  // pick it up — printData is only set once the export finishes loading, so
  // this fires right after that render commits. Cleared on "afterprint"
  // (fires once the browser's print/save-as-PDF dialog closes) rather than
  // immediately, since window.print() returns before the user is done with it.
  useEffect(() => {
    if (!printData) return;
    const timer = setTimeout(() => window.print(), 50);
    const clear = () => setPrintData(null);
    window.addEventListener("afterprint", clear);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("afterprint", clear);
    };
  }, [printData]);

  const exportMutation = useMutation({
    mutationFn: async (format: "json" | "xlsx" | "pdf") => ({
      format,
      result: await exportData({ data: { businessId: businessId! } }),
    }),
    onSuccess: async ({ format, result }) => {
      const stamp = new Date().toISOString().slice(0, 10);
      if (format === "json") {
        downloadJson(`businessos-export-${stamp}.json`, result);
        toast.success("Your data has been downloaded.");
      } else if (format === "xlsx") {
        await downloadExcel(`businessos-export-${stamp}`, result as Record<string, unknown>);
        toast.success("Your data has been downloaded.");
      } else {
        setPrintData(result as Record<string, unknown>);
      }
    },
    onError: (error: Error) => toast.error(readableError(error, "Couldn't export your data.")),
  });

  if (workspace.isLoading || !workspace.data) {
    return (
      <AppShell businessName="" role="" plan="" title="Export data" subtitle="Download your data.">
        <Skeleton className="h-40" />
      </AppShell>
    );
  }

  return (
    <AppShell
      businessName={workspace.data.business.name}
      role={workspace.data.role}
      plan={workspace.data.plan}
      isReadOnly={workspace.data.isReadOnly}
      billingEnabled={workspace.data.billingEnabled}
      title="Export data"
      subtitle="Download everything BusinessOS AI stores for your business."
    >
      <div className="surface max-w-xl space-y-4 p-5">
        <div>
          <h2 className="text-lg font-semibold">Your data, in one file</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Products, customers, sales, invoices, quotes, expenses, and stock history, everything
            tied to your business, as a single file you can keep, back up, or move elsewhere. JSON
            keeps every field for a full backup; Excel is easier to open and browse; PDF is best for
            printing or sharing a read-only copy.
          </p>
        </div>

        {!canExport ? (
          <p className="text-sm text-muted-foreground">
            Only an owner or admin can export this business's data.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              className="gap-1.5"
              disabled={exportMutation.isPending}
              onClick={() => exportMutation.mutate("json")}
            >
              {exportMutation.isPending && exportMutation.variables === "json" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="size-4" aria-hidden="true" />
              )}
              Download my data (JSON)
            </Button>
            <Button
              variant="outline"
              className="gap-1.5"
              disabled={exportMutation.isPending}
              onClick={() => exportMutation.mutate("xlsx")}
            >
              {exportMutation.isPending && exportMutation.variables === "xlsx" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <FileSpreadsheet className="size-4" aria-hidden="true" />
              )}
              Download my data (Excel)
            </Button>
            <Button
              variant="outline"
              className="gap-1.5"
              disabled={exportMutation.isPending}
              onClick={() => exportMutation.mutate("pdf")}
            >
              {exportMutation.isPending && exportMutation.variables === "pdf" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <FileText className="size-4" aria-hidden="true" />
              )}
              Download my data (PDF)
            </Button>
          </div>
        )}
      </div>

      {printData ? (
        <div className="hidden print:block print-area">
          <DataExportPrintView
            businessName={workspace.data.business.name}
            exportedAt={(printData["exportedAt"] as string) ?? new Date().toISOString()}
            data={printData}
          />
        </div>
      ) : null}
    </AppShell>
  );
}
